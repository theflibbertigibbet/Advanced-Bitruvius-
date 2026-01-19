import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

// --- COMPONENTS ---
import { Mannequin } from './components/Mannequin';
import { Controls } from './components/Controls';
import { Timeline } from './components/Timeline';
import { GridBackground, SystemGuides } from './components/SystemGrid';

// --- ATOMIC ASSETS ---
import { DEFAULT_POSE, ANATOMY, FLOOR_HEIGHT } from './constants';
import { Pose } from './types';
import { 
    interpolatePose, 
    getJointPositions, 
    solveTwoBoneIK, 
    applyLimbLimpness, 
    resolveFinalGrounding, 
    clampPoseToBox, 
    getMaxPoseDeviation,
    getGlobalAngle,
    solveCounterRotation
} from './utils/kinematics';

// --- DOMAIN TYPES ---
interface HistoryState { frames: Pose[]; index: number; }
export type FocusMode = 'all' | 'core' | 'upper' | 'lower';
export type ApexBehavior = 'FREEZE' | 'FLOAT' | 'FALL';
export type WaistMode = 'STATIC' | 'HULA';
export type LandingMode = 'STANCE' | 'CHARGE';
export type TestMode = 'IDLE' | 'TAFFY' | 'RAGDOLL' | 'RUBBERBOARD' | 'CHAOS';
export type PhysicsMode = 'NONE' | 'FLOOR' | 'SIT' | 'JUMP';

// --- HELPER TYPES & COMPONENTS ---
type DebugVector = { x1: number, y1: number, x2: number, y2: number, id: number, timestamp: number, color: string };

const ContactMarkers = ({ pose, active }: { pose: Pose, active: boolean }) => {
    if (!active) return null;
    const joints = getJointPositions(pose);
    const points = [joints.lFootTip, joints.rFootTip, joints.lAnkle, joints.rAnkle];
    // Magnetic threshold visualization (5px)
    const contacts = points.filter(p => Math.abs(p.y - FLOOR_HEIGHT) < 5);
    return (
        <g className="pointer-events-none">
            {contacts.map((p, i) => (
                <g key={i} transform={`translate(${p.x}, ${FLOOR_HEIGHT})`}>
                    {/* Magnetic Snap Visual */}
                    <circle r="4" fill="#3b82f6" opacity="0.5" className="animate-ping" />
                    <line x1="-6" y1="0" x2="6" y2="0" stroke="#3b82f6" strokeWidth="2" />
                    <line x1="0" y1="-6" x2="0" y2="6" stroke="#3b82f6" strokeWidth="2" />
                </g>
            ))}
        </g>
    );
};

const DebugOverlay = ({ vectors }: { vectors: DebugVector[] }) => {
    return (
        <g className="pointer-events-none">
            {vectors.map((v) => (
                <g key={v.id} opacity="0.8">
                    <line x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2} stroke={v.color} strokeWidth="1.5" strokeDasharray="2 2" />
                    <circle cx={v.x2} cy={v.y2} r="2" fill={v.color} />
                </g>
            ))}
        </g>
    );
};

const JumpGhost = ({ pose, jumpHeight }: { pose: Pose, jumpHeight: number }) => {
    const apexY = FLOOR_HEIGHT - jumpHeight;
    const ghostPose = { ...pose, root: { ...pose.root, y: apexY } };
    return (
        <g className="pointer-events-none opacity-30">
             <line x1="-1000" y1={apexY} x2="1000" y2={apexY} stroke="#f97316" strokeWidth="1" strokeDasharray="5 5" />
             <g opacity="0.4"><Mannequin pose={ghostPose} showOverlay={false} /></g>
        </g>
    );
};

const CastShadow = ({ pose, skew, isGrounded }: { pose: Pose, skew: boolean, isGrounded: boolean }) => {
    return (
        <g 
            transform={`translate(0, ${FLOOR_HEIGHT}) scale(1.333) ${skew ? 'skewX(20)' : ''} translate(0, -${FLOOR_HEIGHT})`} 
            opacity="0.10" 
            style={{ filter: 'grayscale(100%) blur(1px)' }}
            className="pointer-events-none"
        >
             <Mannequin pose={pose} showOverlay={false} className="text-ink" isGrounded={isGrounded} />
        </g>
    );
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Math Guard: Prevents System Crash on NaN/Infinity
const validatePose = (p: Pose): Pose => {
    const safe = { ...p };
    let corrupted = false;
    const check = (v: number, k: string) => {
        if (!Number.isFinite(v)) {
            // @ts-ignore
            safe[k] = DEFAULT_POSE[k];
            corrupted = true;
        }
    };
    Object.keys(safe).forEach(k => {
        if (k === 'root') {
             check(safe.root.x, 'root.x');
             check(safe.root.y, 'root.y');
        } else if (typeof safe[k as keyof Pose] === 'number') {
             check(safe[k as keyof Pose] as number, k);
        }
    });
    return corrupted ? safe : p;
};

// ==========================================================================================
// BITRUVIUS CORE APPLICATION
// ==========================================================================================
const App = () => {
  
  // 1. TIMELINE & DATA STATE
  const [frames, setFrames] = useState<Pose[]>([DEFAULT_POSE]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(6);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTweening, setIsTweening] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'zipping'>('idle');
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);

  // 2. VIEWPORT & INTERACTION STATE
  const [overlayMode, setOverlayMode] = useState<'auto' | 'on' | 'off'>('auto');
  const [focusMode, setFocusMode] = useState<FocusMode>('all');
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [manualControl, setManualControl] = useState(false);
  const [interactiveParts, setInteractiveParts] = useState<Set<string>>(new Set());
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [ghostParam, setGhostParam] = useState<string | null>(null);
  const [ghostPose, setGhostPose] = useState<Pose | null>(null);
  const [isActivity, setIsActivity] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [wormMode, setWormMode] = useState(false);
  
  // 3. PHYSICS CONFIGURATION (Persistence Defaults: Grounded=True, Gravity=True)
  const [isGrounded, setIsGrounded] = useState(true);
  const [gravity, setGravity] = useState(true);
  const [floorMagnetism, setFloorMagnetism] = useState(100);
  const [sitMode, setSitMode] = useState(false);
  const [seatHeight, setSeatHeight] = useState(FLOOR_HEIGHT - 160);
  const [tension, setTension] = useState(100);
  const [waistMode, setWaistMode] = useState<WaistMode>('STATIC');
  const [hulaMomentum, setHulaMomentum] = useState(false);
  const [hulaSpeed, setHulaSpeed] = useState(3);
  const [hulaAmplitude, setHulaAmplitude] = useState(50);
  // Default to anchored feet for stability
  const [stancePinLeft, setStancePinLeft] = useState(true);
  const [stancePinRight, setStancePinRight] = useState(true);
  const [pinStrength, setPinStrength] = useState(100);
  const [shadowMode, setShadowMode] = useState(true);
  const [shadowSkew, setShadowSkew] = useState(false);

  // 4. DYNAMICS ENGINE
  const [jumpMode, setJumpMode] = useState(false);
  const [jumpCharge, setJumpCharge] = useState(0);
  const [jumpHeight, setJumpHeight] = useState(400);
  const [jumpStartY, setJumpStartY] = useState(FLOOR_HEIGHT);
  const [jumpPhase, setJumpPhase] = useState<'idle' | 'launching' | 'airborne' | 'landing'>('idle');
  const [jumpVelocity, setJumpVelocity] = useState(0);
  const [apexBehavior, setApexBehavior] = useState<ApexBehavior>('FALL');
  const [landingMode, setLandingMode] = useState<LandingMode>('STANCE');
  const [landingFrame, setLandingFrame] = useState(0);

  // 5. TEST DECK & AUDIT
  const [testMode, setTestMode] = useState<TestMode>('IDLE');
  const [systemErrors, setSystemErrors] = useState<string[]>([]);
  const [tensionAlerts, setTensionAlerts] = useState<string[]>([]);
  const [auditMode, setAuditMode] = useState(false);
  const [pinnedJoints, setPinnedJoints] = useState<Map<string, {x: number, y: number}>>(new Map());
  const [balanceTargets, setBalanceTargets] = useState<Map<string, number>>(new Map()); 
  
  // DEBUG SYSTEM
  const [debugVectors, setDebugVectors] = useState<DebugVector[]>([]);
  
  // 6. REFS
  const svgRef = useRef<SVGSVGElement>(null);
  const lastMousePos = useRef<{x: number, y: number} | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chaosLogs = useRef<{ frame: number, type: 'break' | 'tension', message: string, pose: Pose }[]>([]);
  
  // Live Parameter Bridge
  const physicsRefs = useRef({
      hulaSpeed, hulaAmplitude, floorMagnetism, gravity, tension, seatHeight, fps
  });
  useEffect(() => { 
      physicsRefs.current = { hulaSpeed, hulaAmplitude, floorMagnetism, gravity, tension, seatHeight, fps }; 
  }, [hulaSpeed, hulaAmplitude, floorMagnetism, gravity, tension, seatHeight, fps]);

  // Chaos State Bridge
  const chaosState = useRef({ jointIdx: 0, targetVal: 0, frameCount: 0 });

  // --- DERIVED STATE ---
  const conflicts = useMemo(() => {
      const msgs: Record<string, string> = {};
      if (sitMode) { msgs['FLOOR'] = "Sit Active: Floor Suspended"; msgs['JUMP'] = "Sit Active: Jump Locked"; }
      if (jumpMode) { msgs['FLOOR'] = "Jump Active: Floor Auto"; msgs['SIT'] = "Jump Active: Seat Locked"; }
      if (testMode !== 'IDLE' && testMode === 'CHAOS') msgs['ALL_PHYSICS'] = "Chaos Overriding Physics";
      return msgs;
  }, [sitMode, jumpMode, testMode]);

  const displayPose = useMemo(() => {
      const raw = (isPlaying && isTweening && frames.length > 1) 
          ? interpolatePose(frames[currentFrameIndex], frames[(currentFrameIndex + 1) % frames.length], 0.5) 
          : frames[currentFrameIndex];
      
      let final = raw;

      if (tension < 100 && !dragTarget) {
          const relaxed = applyLimbLimpness(final);
          const t = tension / 100;
          const blended: any = { ...final };
          ['lShoulder', 'rShoulder', 'lThigh', 'rThigh', 'lForearm', 'rForearm', 'lCalf', 'rCalf'].forEach(key => {
             if (!balanceTargets.has(key)) {
                 // @ts-ignore
                 blended[key] = lerp(relaxed[key], final[key], t);
             }
          });
          final = blended as Pose;
      }

      if (balanceTargets.size > 0) {
          const balanced = { ...final };
          balanceTargets.forEach((targetGlobalAngle, boneKey) => {
              const counterRot = solveCounterRotation(balanced, boneKey, targetGlobalAngle);
              // @ts-ignore
              balanced[boneKey] = counterRot;
          });
          final = balanced;
      }

      if (jumpMode && jumpCharge > 0 && jumpPhase === 'idle') {
          const squatDepth = (jumpCharge / 100) * 120;
          const crouched = { ...final };
          crouched.root = { ...crouched.root, y: crouched.root.y + squatDepth };
          const j = getJointPositions(final); 
          const solveLeg = (isRight: boolean) => {
              const hipOffset = isRight ? ANATOMY.HIP_WIDTH/4 : -ANATOMY.HIP_WIDTH/4;
              const newHip = { x: crouched.root.x + hipOffset, y: crouched.root.y + ANATOMY.PELVIS };
              const ankleTarget = isRight ? j.rAnkle : j.lAnkle;
              const res = solveTwoBoneIK(crouched.rootRotation || 0, crouched.hips, newHip, ankleTarget, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1);
              if (isRight) { crouched.rThigh = res.thigh; crouched.rCalf = res.calf; crouched.rAnkle = -(crouched.rootRotation||0) - (crouched.hips) - res.thigh - res.calf - (-90); } 
              else { crouched.lThigh = res.thigh; crouched.lCalf = res.calf; crouched.lAnkle = -(crouched.rootRotation||0) - (crouched.hips) - res.thigh - res.calf - (90); }
          };
          solveLeg(true); solveLeg(false);
          final = crouched;
      }
      
      return validatePose(final); // Self-Healing check before render
  }, [frames, currentFrameIndex, isPlaying, isTweening, tension, dragTarget, jumpMode, jumpCharge, jumpPhase, balanceTargets]);

  // --- HELPERS ---
  const recordHistory = useCallback(() => { 
      setPast(prev => [...prev, { frames, index: currentFrameIndex }]); 
      setFuture([]); 
  }, [frames, currentFrameIndex]);

  const addDebugVector = (p1: {x:number, y:number}, p2: {x:number, y:number}, color: string = '#d946ef') => {
      const id = Math.random();
      setDebugVectors(prev => [...prev, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, id, timestamp: performance.now(), color }]);
      setTimeout(() => setDebugVectors(p => p.filter(v => v.id !== id)), 500); // Live for 500ms
  };

  const handlePhysicsToggle = (mode: PhysicsMode) => {
    if (testMode !== 'IDLE') setTestMode('IDLE');
    if (mode === 'SIT') {
        const next = !sitMode; setSitMode(next);
        if (next) { setIsGrounded(false); setJumpMode(false); setJumpPhase('idle'); }
    } else if (mode === 'FLOOR') {
        const next = !isGrounded; setIsGrounded(next);
        if (next) { setSitMode(false); setJumpMode(false); }
    } else if (mode === 'JUMP') {
        const next = !jumpMode; setJumpMode(next);
        if (next) { setSitMode(false); setIsGrounded(true); }
    }
  };
  
  const handleBalanceToggle = (key: string) => {
      setBalanceTargets(prev => {
          const next = new Map(prev);
          if (next.has(key)) { next.delete(key); } else { next.set(key, getGlobalAngle(displayPose, key)); }
          return next;
      });
  };

  const handleTestModeChange = (mode: TestMode) => {
      if (testMode === 'CHAOS' && mode !== 'CHAOS') { setIsRecording(false); handleExportSequence(); }
      
      setFrames(p => { const n = [...p]; n[currentFrameIndex] = { ...DEFAULT_POSE }; return n; });
      setPinnedJoints(new Map());
      setTension(100);
      setGravity(true);
      setIsGrounded(true);
      setBalanceTargets(new Map());
      
      if (mode === 'CHAOS') { 
          setCurrentFrameIndex(0); chaosLogs.current = []; setIsRecording(true); 
          chaosState.current = { jointIdx: 0, targetVal: 0, frameCount: 0 };
      }
      if (mode !== 'IDLE') { setSitMode(false); setJumpMode(false); }
      
      setTestMode(mode);
  };

  const handleResetTPose = () => {
      handleTestModeChange('IDLE');
      setSitMode(false); setJumpMode(false); setJumpPhase('idle');
      setIsGrounded(true); setWaistMode('STATIC'); setHulaMomentum(false);
      setStancePinLeft(true); setStancePinRight(true); 
      setPinnedJoints(new Map()); // Reset pins
      setBalanceTargets(new Map());
      setIsPlaying(false); chaosLogs.current = [];
      recordHistory();
      setFrames(prev => { const n = [...prev]; n[currentFrameIndex] = { ...DEFAULT_POSE }; return n; });
  };

  // --- CORE LOOPS ---

  // 1. SYSTEM HEALTH MONITOR
  useEffect(() => {
      const errors: string[] = [];
      if (jumpMode && waistMode === 'STATIC') errors.push("CONFLICT: STATIC WAIST + JUMP");
      if (jumpMode && (stancePinLeft || stancePinRight) && jumpPhase === 'airborne') errors.push("WARN: PINS IN FLIGHT");
      if (testMode !== 'IDLE') errors.push(`TEST: ${testMode}`);
      setSystemErrors(errors);
  }, [jumpMode, waistMode, stancePinLeft, stancePinRight, jumpPhase, testMode]);

  // 2. PIN SYNCHRONIZER
  // Initialize and Sync Pins
  useEffect(() => {
      if (testMode !== 'IDLE') return;
      const joints = getJointPositions(displayPose);
      setPinnedJoints(prev => {
          const next = new Map(prev);
          // Auto-Snap to floor if close enough when enabling pins
          const snap = (y: number) => isGrounded && Math.abs(y - FLOOR_HEIGHT) < 20 ? FLOOR_HEIGHT : y;
          
          if (stancePinLeft) { 
              if (!next.has('lFoot')) next.set('lFoot', { x: joints.lAnkle.x, y: snap(joints.lAnkle.y) }); 
          } else { next.delete('lFoot'); }
          
          if (stancePinRight) { 
              if (!next.has('rFoot')) next.set('rFoot', { x: joints.rAnkle.x, y: snap(joints.rAnkle.y) }); 
          } else { next.delete('rFoot'); }
          
          return next;
      });
  }, [stancePinLeft, stancePinRight, testMode, isGrounded]); 

  // 3. GHOST ENGINE
  useEffect(() => {
    if (!ghostParam) { setGhostPose(null); return; }
    const base = frames[currentFrameIndex];
    const ghost = { ...base };
    const offset = 20;
    if (ghostParam === 'root') ghost.root = { ...base.root, y: base.root.y - 40 };
    else if (ghostParam === 'hips') ghost.hips = base.hips + offset;
    else if (ghostParam === 'torso') ghost.torso = base.torso + (offset/2);
    else if (ghostParam === 'neck') ghost.neck = base.neck + offset;
    else if (ghostParam.includes('Thigh')) { /* @ts-ignore */ ghost[ghostParam] = base[ghostParam] + 30; }
    else if (ghostParam.includes('Calf') || ghostParam.includes('Forearm')) { /* @ts-ignore */ ghost[ghostParam] = base[ghostParam] + 45; }
    else if (ghostParam in ghost) { /* @ts-ignore */ ghost[ghostParam] = base[ghostParam] + offset; }
    
    if (pinnedJoints.size > 0) {
        const j = getJointPositions(ghost);
        pinnedJoints.forEach((t, k) => {
            if (k === 'lFoot' || k === 'rFoot') {
                const isR = k === 'rFoot';
                const res = solveTwoBoneIK(ghost.rootRotation||0, ghost.hips, isR?j.rHip:j.lHip, t, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1);
                if (isR) { ghost.rThigh = res.thigh; ghost.rCalf = res.calf; } else { ghost.lThigh = res.thigh; ghost.lCalf = res.calf; }
            }
        });
    }
    setGhostPose(ghost);
  }, [ghostParam, currentFrameIndex, frames, pinnedJoints]);

  // 4. TEST DECK SIMULATION LOOP (With Self-Healing & Visual Debug)
  useEffect(() => {
      if (testMode === 'IDLE') return;
      let frameId: number;
      const startTime = performance.now();
      
      const runTest = (time: number) => {
          const t = (time - startTime) / 1000;
          const liveFps = physicsRefs.current.fps;
          // Scale animation speed by FPS (Lower FPS = Slow Motion Debug)
          const dt = 1.0 / liveFps; 
          
          let updates: Partial<Pose> = {};
          let nextPins = new Map<string, {x:number, y:number}>();
          
          setFrames(prev => {
             const current = prev[currentFrameIndex];
             let nextPose = { ...current };

             if (testMode === 'TAFFY') {
                 // MAGNETIC SMART ANCHORING: Force feet to floor
                 // Redirects lift force into IK flexion implicitly
                 const j = getJointPositions(DEFAULT_POSE);
                 nextPins.set('lHand', { x: -ANATOMY.SHOULDER_WIDTH - 50, y: -400 });
                 nextPins.set('rHand', { x: ANATOMY.SHOULDER_WIDTH + 50, y: -400 });
                 nextPins.set('lFoot', { x: j.lHip.x, y: FLOOR_HEIGHT });
                 nextPins.set('rFoot', { x: j.rHip.x, y: FLOOR_HEIGHT });
                 
                 updates.root = { x: 0, y: Math.sin(t * 5) * 60 };
                 updates.torso = 180 + Math.sin(t*3)*10;
                 updates.hips = Math.cos(t*4)*15;
             } 
             else if (testMode === 'RUBBERBOARD') {
                 const bounce = Math.abs(Math.sin(t * 8)) * 120;
                 setTension(20);
                 updates.root = { x: 0, y: Math.min(0, bounce - 100) }; 
                 updates.rThigh = Math.sin(t*10)*20;
                 updates.lThigh = Math.cos(t*10)*20;
             } 
             else if (testMode === 'RAGDOLL') {
                  setTension(0);
                  if (t < 0.2) {
                     updates.rCalf = 120; updates.lCalf = 120;
                     updates.rThigh = -45; updates.lThigh = -45;
                  }
                  const drop = 20 + (t * t * 900);
                  // Allow it to fall past floor slightly to trigger "Bounce/Correction" logic
                  updates.root = { ...nextPose.root, y: drop };
                  updates.torso = 180 + Math.sin(t*10)*20;
                  updates.neck = Math.sin(t*15)*30;
             } 
             else if (testMode === 'CHAOS') {
                  // READABLE CHAOS: Sequential Shift
                  const cs = chaosState.current;
                  cs.frameCount++;
                  const shiftInterval = 30 * (60/liveFps); // Adjust duration based on FPS
                  
                  if (cs.frameCount > shiftInterval) {
                      cs.frameCount = 0;
                      cs.jointIdx = (cs.jointIdx + 1) % 6;
                      cs.targetVal = (Math.random() - 0.5) * 90;
                  }
                  
                  const joints: (keyof Pose)[] = ['torso', 'hips', 'lShoulder', 'rShoulder', 'lThigh', 'rThigh'];
                  const key = joints[cs.jointIdx];
                  // @ts-ignore
                  const curr = nextPose[key] as number;
                  // @ts-ignore
                  updates[key] = lerp(curr, cs.targetVal, 0.1); // Smooth lerp
                  
                  updates.root = { x: Math.sin(t) * 100, y: Math.cos(t) * 50 };
             }

             nextPose = { ...nextPose, ...updates };
             setPinnedJoints(nextPins);

             // --- SOLVER & CORRECTION LAYER ---
             const poseBeforeSolver = { ...nextPose };
             
             if (testMode === 'RUBBERBOARD') {
                  const bounce = Math.abs(Math.sin(t * 8)) * 120;
                  nextPose = resolveFinalGrounding(nextPose, FLOOR_HEIGHT - bounce, 1, false, 0);
             } else {
                  if (gravity) {
                     // RAGDOLL BOUNCE & VISUAL DEBUG
                     // Detect if we are penetrating floor
                     const preY = nextPose.root.y;
                     nextPose = resolveFinalGrounding(nextPose, FLOOR_HEIGHT, floorMagnetism/100, sitMode, seatHeight);
                     const postY = nextPose.root.y;
                     
                     // If correction happened (bounce/clamp)
                     if (Math.abs(postY - preY) > 5) {
                         // Draw Vector from Error to Corrected
                         // We can't access setDebugVectors easily inside this specific closure frame without triggering loop issues
                         // But we can check penetration relative to anatomy
                         const j = getJointPositions(poseBeforeSolver);
                         const lowest = Math.max(j.lFootTip.y, j.rFootTip.y);
                         if (lowest > FLOOR_HEIGHT + 5) {
                              // It penetrated. We snapped it back.
                              // Let's visualize the "Bounce Force" - Vector Up
                              // Since we can't side-effect easily, we rely on the component render to show the snap
                              // Or we could hack it into a ref for the overlay.
                              // For now, the visual effect is the "Snap" itself.
                              // NOTE: Ideally we'd call addDebugVector here but that triggers state updates.
                         }
                     }
                  }
             }

             if (nextPins.size > 0) {
                const j = getJointPositions(nextPose);
                nextPins.forEach((tgt, key) => {
                    if (key.includes('Foot')) {
                        const isR = key === 'rFoot';
                        const res = solveTwoBoneIK(nextPose.rootRotation||0, nextPose.hips, isR?j.rHip:j.lHip, tgt, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1, tension);
                        if (isR) { nextPose.rThigh = res.thigh; nextPose.rCalf = res.calf; nextPose.rLegStretch = res.stretch; } 
                        else { nextPose.lThigh = res.thigh; nextPose.lCalf = res.calf; nextPose.lLegStretch = res.stretch; }
                    } else if (key.includes('Hand')) {
                        const isR = key === 'rHand';
                        const cr = (nextPose.rootRotation||0) + nextPose.torso;
                        const res = solveTwoBoneIK(cr, isR?90:-90, isR?j.rShoulder:j.lShoulder, tgt, ANATOMY.UPPER_ARM, ANATOMY.LOWER_ARM, isR?1:-1, tension);
                        if (isR) { nextPose.rShoulder = res.thigh; nextPose.rForearm = res.calf; } else { nextPose.lShoulder = res.thigh; nextPose.lForearm = res.calf; }
                    }
                });
             }

             nextPose = clampPoseToBox(nextPose, 1200);
             
             // SELF-HEALING MATH GUARD
             nextPose = validatePose(nextPose);

             const n = [...prev]; 
             if (testMode === 'CHAOS') return [...prev, nextPose];
             n[currentFrameIndex] = nextPose; 
             return n;
          });
          
          if (testMode === 'CHAOS') setCurrentFrameIndex(p => p + 1);
          frameId = requestAnimationFrame(runTest);
      };
      
      frameId = requestAnimationFrame(runTest);
      return () => cancelAnimationFrame(frameId);
  }, [testMode, currentFrameIndex, isGrounded, sitMode, seatHeight, floorMagnetism, jumpPhase, tension, auditMode, gravity]);

  // 5. PHYSICS & PHYSICS LOOP (Hula / Jump)
  useEffect(() => {
    const isActive = jumpPhase !== 'idle' || (waistMode === 'HULA' && hulaMomentum);
    if (!isActive) return;
    let frameId: number;
    let lastTime = performance.now();
    let hulaAnchors: any = null;
    let baseRootY = 0;

    const updatePhysics = (time: number) => {
        const dt = (time - lastTime) / 1000;
        lastTime = time;
        const p = physicsRefs.current; // Live Values

        setFrames(prev => {
            const current = prev[currentFrameIndex];
            const updated = [...prev];
            
            // HULA
            if (waistMode === 'HULA' && hulaMomentum && jumpPhase === 'idle') {
                 if (!hulaAnchors) { const j = getJointPositions(current); hulaAnchors = { l: pinnedJoints.get('lFoot') || {x: j.lAnkle.x, y: FLOOR_HEIGHT}, r: pinnedJoints.get('rFoot') || {x: j.rAnkle.x, y: FLOOR_HEIGHT} }; baseRootY = current.root.y; }
                 
                 const t = time / 1000; 
                 const phase = t * p.hulaSpeed; 
                 const sine = Math.sin(phase); 
                 const ampScale = p.hulaAmplitude * 2.5; 
                 const swayX = sine * ampScale; 
                 const riseY = Math.abs(sine) * (ampScale * 0.2); 
                 
                 const next = { ...current };
                 const isLeaningLeft = sine < 0; 
                 const activePivot = isLeaningLeft ? hulaAnchors.l : hulaAnchors.r; 
                 const passiveTarget = isLeaningLeft ? hulaAnchors.r : hulaAnchors.l; 
                 const hipOffset = isLeaningLeft ? ANATOMY.HIP_WIDTH/4 : -ANATOMY.HIP_WIDTH/4; 
                 const pivotBaseX = activePivot.x + hipOffset;
                 
                 next.root.x = pivotBaseX + swayX; 
                 next.root.y = baseRootY - riseY; 
                 next.hips = sine * 35; 
                 next.torso = 180 - (sine * 15);
                 
                 const j = getJointPositions(next); 
                 const pivotRes = solveTwoBoneIK(next.rootRotation||0, next.hips, isLeaningLeft ? j.lHip : j.rHip, activePivot, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1);
                 if (isLeaningLeft) { next.lThigh = pivotRes.thigh; next.lCalf = pivotRes.calf; next.lLegStretch = pivotRes.stretch; } 
                 else { next.rThigh = pivotRes.thigh; next.rCalf = pivotRes.calf; next.rLegStretch = pivotRes.stretch; }
                 
                 const liftHeight = Math.max(0, (Math.abs(sine) * p.hulaAmplitude) - 20); 
                 const passiveFootPos = { x: passiveTarget.x + (swayX * 0.2), y: FLOOR_HEIGHT - liftHeight }; 
                 const passiveRes = solveTwoBoneIK(next.rootRotation||0, next.hips, isLeaningLeft ? j.rHip : j.lHip, passiveFootPos, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1);
                 if (isLeaningLeft) { next.rThigh = passiveRes.thigh; next.rCalf = passiveRes.calf; next.rAnkle = 20 + (sine * 10); next.rLegStretch = passiveRes.stretch; } 
                 else { next.lThigh = passiveRes.thigh; next.lCalf = passiveRes.calf; next.lAnkle = 20 + (sine * 10); next.lLegStretch = passiveRes.stretch; }
                 
                 updated[currentFrameIndex] = clampPoseToBox(next, 1200);
                 return updated;
            }

            // JUMP
            if (jumpPhase === 'launching') { setJumpPhase('airborne'); return prev; }
            if (jumpPhase === 'airborne') {
                const G = 35; 
                let newY = current.root.y - (jumpVelocity * dt * 60); 
                let newVel = jumpVelocity - (9.8 * dt * G); 
                const CEILING = -550;
                if (newY < CEILING) { newY = CEILING; newVel = -newVel * 0.5; }
                if (jumpVelocity > 0 && newVel <= 0) { 
                    if (apexBehavior === 'FREEZE') { setJumpPhase('idle'); return prev; } 
                    if (apexBehavior === 'FLOAT') return prev; 
                }
                if (newVel < 0) { 
                    const standingH = FLOOR_HEIGHT - (ANATOMY.LEG_UPPER + ANATOMY.LEG_LOWER) * 0.95; 
                    if (newY >= standingH) { setJumpPhase('landing'); setLandingFrame(0); updated[currentFrameIndex] = { ...current, root: { x: current.root.x, y: standingH } }; return updated; } 
                }
                const next = { ...current, root: { ...current.root, y: newY }, rShoulder: Math.max(-170, current.rShoulder - (newVel>0?8:-4)), lShoulder: Math.min(170, current.lShoulder + (newVel>0?8:-4)), rThigh: lerp(current.rThigh, 0, 0.2), lThigh: lerp(current.lThigh, 0, 0.2), rCalf: lerp(current.rCalf, 0, 0.2), lCalf: lerp(current.lCalf, 0, 0.2), torso: 180, neck: 0 };
                updated[currentFrameIndex] = clampPoseToBox(next, 1200);
                setJumpVelocity(newVel);
                return updated;
            } 
            else if (jumpPhase === 'landing') {
                 const DUR = 12; const f = landingFrame + 1; setLandingFrame(f);
                 if (f > DUR) { setJumpPhase('idle'); if (landingMode === 'STANCE') setJumpCharge(0); return prev; }
                 const standH = FLOOR_HEIGHT - (ANATOMY.LEG_UPPER + ANATOMY.LEG_LOWER) * 0.95; 
                 const absD = 40 * Math.sin((f / DUR) * Math.PI); 
                 const absY = standH + absD;
                 let land = { ...current, root: { ...current.root, y: absY } }; 
                 const j = getJointPositions(land); const lf = { x: j.lHip.x, y: FLOOR_HEIGHT }; const rf = { x: j.rHip.x, y: FLOOR_HEIGHT };
                 const lr = solveTwoBoneIK(land.rootRotation||0, land.hips, j.lHip, lf, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1); 
                 const rr = solveTwoBoneIK(land.rootRotation||0, land.hips, j.rHip, rf, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1);
                 land.lThigh = lr.thigh; land.lCalf = lr.calf; land.rThigh = rr.thigh; land.rCalf = rr.calf;
                 land.lLegStretch = lr.stretch; land.rLegStretch = rr.stretch;
                 updated[currentFrameIndex] = clampPoseToBox(land, 1200);
                 return updated;
            }
            return prev;
        });
        if (isActive) frameId = requestAnimationFrame(updatePhysics);
    };
    frameId = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(frameId);
  }, [jumpPhase, jumpVelocity, currentFrameIndex, apexBehavior, waistMode, hulaMomentum, pinnedJoints, landingMode]);

  // --- HANDLERS ---
  const handlePoseChange = (updates: Partial<Pose>) => {
    if (isPlaying) setIsPlaying(false);
    const prev = frames[currentFrameIndex];
    let candidate = { ...prev, ...updates };
    
    if (getMaxPoseDeviation(prev, candidate) > 50 && !manualControl) console.warn("Delta Limit");

    // Helper: Pin Enforcer
    // Applies Two-Bone IK to force feet (or hands) to pinned locations
    const applyPinConstraints = (p: Pose) => {
        if (!pinnedJoints.size) return p;
        // The core requirement: Hard Coded EXCEPT jumping/sitting/hula
        if (jumpMode || sitMode || hulaMomentum) return p;

        const next = { ...p };
        const j = getJointPositions(next);
        
        const solve = (key: string, isRight: boolean) => {
             const pin = pinnedJoints.get(key);
             if (!pin) return;
             
             const hip = isRight ? j.rHip : j.lHip; // Current Hip Pos
             const res = solveTwoBoneIK(
                 next.rootRotation || 0,
                 next.hips,
                 hip,
                 pin,
                 ANATOMY.LEG_UPPER,
                 ANATOMY.LEG_LOWER,
                 1, // Bend Direction
                 tension
             );
             
             if (isRight) {
                 next.rThigh = res.thigh;
                 next.rCalf = res.calf;
                 next.rLegStretch = res.stretch; // Store elastic stretch
                 if (isGrounded && Math.abs(pin.y - FLOOR_HEIGHT) < 10) {
                     const globalLeg = (next.rootRotation||0) + next.hips + res.thigh + res.calf;
                     next.rAnkle = 90 - globalLeg;
                 }
             } else {
                 next.lThigh = res.thigh;
                 next.lCalf = res.calf;
                 next.lLegStretch = res.stretch; // Store elastic stretch
                 if (isGrounded && Math.abs(pin.y - FLOOR_HEIGHT) < 10) {
                     const globalLeg = (next.rootRotation||0) + next.hips + res.thigh + res.calf;
                     next.lAnkle = -90 - globalLeg;
                 }
             }
        };

        if (stancePinLeft && pinnedJoints.has('lFoot')) solve('lFoot', false);
        if (stancePinRight && pinnedJoints.has('rFoot')) solve('rFoot', true);
        
        return next;
    };

    if (sitMode && !jumpMode) {
        candidate.root.y = seatHeight - ANATOMY.PELVIS;
        const j = getJointPositions(candidate);
        const solve = (isR: boolean, hip: any) => {
             if (gravity) {
                const res = solveTwoBoneIK(candidate.rootRotation||0, candidate.hips, hip, {x: hip.x, y: FLOOR_HEIGHT}, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1, 100);
                return { ...res, ankle: res.stretch > 0 ? 0 : 0 };
             } else return { thigh: 0, calf: 0, ankle: 0, stretch: 0 };
        };
        const rr = solve(true, j.rHip); const lr = solve(false, j.lHip);
        candidate.rThigh = rr.thigh; candidate.rCalf = rr.calf; candidate.rAnkle = rr.ankle; candidate.rLegStretch = rr.stretch;
        candidate.lThigh = lr.thigh; candidate.lCalf = lr.calf; candidate.lAnkle = lr.ankle; candidate.lLegStretch = lr.stretch;
    }
    else {
        // === RIGID GROUNDING PIPELINE ===
        
        // Pass 1: Apply IK to User Input
        // If user moved root/hips, this ensures feet attempt to stay at pins relative to new body
        candidate = applyPinConstraints(candidate);
        
        if (isGrounded && !jumpMode) {
            // Pass 2: Resolve Collision/Magnetism
            // This might move the root up (collision) or down (magnetism)
            const grounded = resolveFinalGrounding(candidate, FLOOR_HEIGHT, floorMagnetism/100, false, 0); 
            
            // Pass 3: Re-Apply IK
            // If Pass 2 moved the root, we must re-solve legs to keep feet pinned.
            // If we don't, feet will drift with the root movement.
            if (grounded.root.y !== candidate.root.y || grounded.root.x !== candidate.root.x) {
                candidate = applyPinConstraints(grounded);
            } else {
                candidate = grounded;
            }
        }
    }

    candidate = clampPoseToBox(candidate, 1200);
    setFrames(p => { const n = [...p]; n[currentFrameIndex] = candidate; return n; });
  };

  const handlePointerDown = (e: React.PointerEvent) => { 
      if (!manualControl) return; 
      const m = getMouseSVG(e); lastMousePos.current = m; 
      const t = getClosestInteractivePart(m); 
      if (t && t !== 'head') { recordHistory(); setDragTarget(t); setSelectedPart(t); e.stopPropagation(); e.preventDefault(); } 
      else if (t === 'head') setSelectedPart('head'); 
      else { setSelectedPart(null); setDragTarget('root'); recordHistory(); } 
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
      if (!manualControl && !dragTarget) return;
      const m = getMouseSVG(e);
      let mouse = m;
      if (dragTarget && lastMousePos.current && !e.shiftKey) { const p = lastMousePos.current; mouse = { x: p.x * 0.8 + m.x * 0.2, y: p.y * 0.8 + m.y * 0.2 }; }
      const prev = lastMousePos.current || mouse;
      const d = { x: mouse.x - prev.x, y: mouse.y - prev.y };
      lastMousePos.current = mouse;
      if (!dragTarget) { if (manualControl) setHoveredPart(getClosestInteractivePart(mouse)); return; }
      
      const p = frames[currentFrameIndex];
      const updates: Partial<Pose> = {};
      
      if (dragTarget === 'root') {
          if (waistMode === 'STATIC') { updates.rootRotation = (p.rootRotation||0) + d.x * 0.5; }
          else if (waistMode === 'HULA') { updates.hips = Math.max(-45, Math.min(45, (p.hips||0) + d.x*0.5)); updates.root = { x: p.root.x + d.x*0.2, y: p.root.y + d.y }; }
          else { updates.root = { x: mouse.x, y: mouse.y }; }
          
          if (pinnedJoints.size > 0) {
              const slide = 1 - (pinStrength/100);
              const nextPins = new Map<string, {x: number, y: number}>(pinnedJoints);
              nextPins.forEach((pos, k) => nextPins.set(k, { x: pos.x + d.x*slide, y: pos.y + d.y*slide }));
              setPinnedJoints(nextPins);
              
              // Note: We don't perform IK here anymore because handlePoseChange now handles it centrally.
              // We just update the pin coordinates state.
          }
      } else {
          // Limb Drag
          const j = getJointPositions(p);
          const isIK = e.ctrlKey || e.metaKey || (stancePinLeft && dragTarget === 'lFoot') || (stancePinRight && dragTarget === 'rFoot');
          if (isIK && dragTarget.includes('Foot')) {
              // Dragging Foot with IK -> Updates the PIN location
              const isR = dragTarget === 'rFoot';
              const pinKey = isR ? 'rFoot' : 'lFoot';
              const nextPins = new Map(pinnedJoints);
              nextPins.set(pinKey, mouse); // Update pin to mouse pos
              setPinnedJoints(nextPins);
              
              // IK is handled by handlePoseChange automatically now because we updated the pin!
              // But we need to trigger handlePoseChange to re-render.
              // We pass empty updates to force re-evaluation against new pins?
              // Or we pass the IK result directly to be safe.
              
              const r = solveTwoBoneIK(p.rootRotation||0, p.hips, isR?j.rHip:j.lHip, mouse, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1, tension);
              if (isR) { updates.rThigh = r.thigh; updates.rCalf = r.calf; updates.rLegStretch = r.stretch; } 
              else { updates.lThigh = r.thigh; updates.lCalf = r.calf; updates.lLegStretch = r.stretch; }
          } else {
               // FK Drag (simplified)
               const solveFK = (piv: any, tip: any, curr: number) => {
                   const oldA = Math.atan2(tip.y - piv.y, tip.x - piv.x) * 180 / Math.PI;
                   const newA = Math.atan2(mouse.y - piv.y, mouse.x - piv.x) * 180 / Math.PI;
                   return curr + (newA - oldA);
               };
               // Mapping
               if (dragTarget === 'rHand') updates.rWrist = solveFK(j.rWrist, j.rHandTip, p.rWrist);
               if (dragTarget === 'rFoot') updates.rAnkle = solveFK(j.rAnkle, j.rFootTip, p.rAnkle);
               if (dragTarget === 'rElbow') updates.rShoulder = solveFK(j.rShoulder, j.rElbow, p.rShoulder);
               if (dragTarget === 'lHand') updates.lWrist = solveFK(j.lWrist, j.lHandTip, p.lWrist);
               if (dragTarget === 'lFoot') updates.lAnkle = solveFK(j.lAnkle, j.lFootTip, p.lAnkle);
               if (dragTarget === 'lElbow') updates.lShoulder = solveFK(j.lShoulder, j.lElbow, p.lShoulder);
          }
      }
      handlePoseChange(updates);
  };

  const getMouseSVG = (e: React.PointerEvent) => { if (!svgRef.current) return { x: 0, y: 0 }; const CTM = svgRef.current.getScreenCTM(); if (!CTM) return { x: 0, y: 0 }; return { x: (e.clientX - CTM.e) / CTM.a, y: (e.clientY - CTM.f) / CTM.d }; };
  const getClosestInteractivePart = (m: {x:number, y:number}) => { 
      const j = getJointPositions(displayPose); 
      const t = [ {k:'rHand',p:j.rHandTip}, {k:'lHand',p:j.lHandTip}, {k:'rFoot',p:j.rFootTip}, {k:'lFoot',p:j.lFootTip}, {k:'head',p:j.headTop}, {k:'root',p:displayPose.root} ];
      let c = null, min = 35; 
      for (const i of t) { const d = Math.sqrt((i.p.x-m.x)**2 + (i.p.y-m.y)**2); if(d<min){min=d;c=i.k;} } 
      return c; 
  };
  const handleJumpTrigger = () => { handlePhysicsToggle('JUMP'); setJumpStartY(FLOOR_HEIGHT - 40); setJumpVelocity(jumpHeight * 0.18); setJumpPhase('launching'); setHulaMomentum(false); recordHistory(); };
  const handleExportSequence = async () => { setExportStatus('rendering'); try { const zip = new JSZip(); zip.file("sequence.json", JSON.stringify({ frames, fps, chaosLogs: chaosLogs.current }, null, 2)); if (svgRef.current) zip.file("current.svg", new XMLSerializer().serializeToString(svgRef.current)); setExportStatus('zipping'); FileSaver.saveAs(await zip.generateAsync({type:"blob"}), "bitruvius.zip"); } catch (e) { console.error(e); } finally { setExportStatus('idle'); } };
  const handleUndo = useCallback(() => { if (past.length===0) return; const p = past.pop(); setFuture(f=>[{frames,index:currentFrameIndex},...f]); setPast([...past]); if(p){ setFrames(p.frames); setCurrentFrameIndex(p.index); setIsPlaying(false); } }, [past, frames, currentFrameIndex]);
  const handleRedo = useCallback(() => { if (future.length===0) return; const n = future.shift(); setPast(p=>[...p,{frames,index:currentFrameIndex}]); setFuture([...future]); if(n){ setFrames(n.frames); setCurrentFrameIndex(n.index); setIsPlaying(false); } }, [future, frames, currentFrameIndex]);

  useEffect(() => { setIsActivity(true); if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current); activityTimeoutRef.current = setTimeout(() => setIsActivity(false), 2000); }, [displayPose]);
  
  // --- RENDER ---
  return (
    <div className="w-full h-screen bg-paper overflow-hidden flex flex-row touch-none">
      
      {showTimeline && (
          <Timeline 
            frames={frames} currentFrameIndex={currentFrameIndex} onSelectFrame={setCurrentFrameIndex}
            onAddFrame={() => { recordHistory(); setFrames(p => [...p, {...p[currentFrameIndex]}]); setCurrentFrameIndex(p => p + 1); }}
            onInsertInBetween={() => { recordHistory(); const next = (currentFrameIndex + 1) % frames.length; const p = interpolatePose(frames[currentFrameIndex], frames[next], 0.5); setFrames(prev => { const n = [...prev]; n.splice(currentFrameIndex + 1, 0, p); return n; }); setCurrentFrameIndex(p => p + 1); }}
            onDeleteFrame={() => { if(frames.length > 1) { recordHistory(); setFrames(p => p.filter((_, i) => i !== currentFrameIndex)); if(currentFrameIndex >= frames.length - 1) setCurrentFrameIndex(p => p - 1); } }}
            isPlaying={isPlaying} onTogglePlay={() => setIsPlaying(!isPlaying)}
            isRecording={isRecording} onToggleRecord={() => setIsRecording(!isRecording)}
            isTweening={isTweening} onToggleTween={() => setIsTweening(!isTweening)}
            onExport={handleExportSequence} exportStatus={exportStatus}
            fps={fps} onChangeFps={setFps}
            onUndo={handleUndo} onRedo={handleRedo} canUndo={past.length > 0} canRedo={future.length > 0}
            testMode={testMode} setTestMode={handleTestModeChange} onResetTPose={handleResetTPose}
            pose={frames[currentFrameIndex]}
            onChange={handlePoseChange}
            onHoverControl={setGhostParam}
            balanceTargets={balanceTargets}
            onToggleBalance={handleBalanceToggle}
            stancePinLeft={stancePinLeft}
            setStancePinLeft={setStancePinLeft}
            stancePinRight={stancePinRight}
            setStancePinRight={setStancePinRight}
          />
      )}

      <div className="flex-1 relative z-10 flex items-center justify-center bg-gray-100 shadow-inner">
        <button onClick={() => setShowTimeline(!showTimeline)} className="absolute top-4 left-4 z-50 p-2 bg-white/80 border border-gray-300 rounded-full hover:bg-white shadow-sm transition-all">{showTimeline ? '◀' : '▶'}</button>
        <button onClick={() => setShowControls(!showControls)} className="absolute top-4 right-4 z-50 p-2 bg-white/80 border border-gray-300 rounded-full hover:bg-white shadow-sm transition-all">{showControls ? '▶' : '◀'}</button>

        <div className="relative aspect-square h-[95%] max-h-[95%] w-auto max-w-[95%] bg-paper border-2 border-gray-900 rounded-lg shadow-2xl overflow-hidden ring-4 ring-gray-200">
            {/* BACKGROUND PATTERN: Independent DIV */}
            <GridBackground />

            {/* MAIN SVG SCENE */}
            <svg 
                ref={svgRef} width="100%" height="100%" viewBox="-600 -600 1200 1200" 
                className={`overflow-visible ${manualControl ? 'cursor-crosshair' : 'cursor-default'} relative z-10`}
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => setDragTarget(null)} onPointerLeave={() => setDragTarget(null)}
            >
                {/* SYSTEM GUIDES: Rendered inside SVG to match coordinate space */}
                <SystemGuides floorY={FLOOR_HEIGHT} dimGround={!isGrounded} sitMode={sitMode} seatHeight={seatHeight} />

                {/* DEBUG OVERLAY */}
                {debugVectors.length > 0 && <DebugOverlay vectors={debugVectors} />}

                {/* SHADOW LAYER */}
                {shadowMode && <CastShadow pose={displayPose} skew={shadowSkew} isGrounded={isGrounded} />}

                {jumpMode && <JumpGhost pose={displayPose} jumpHeight={jumpHeight} />}
                {ghostPose && <g opacity="0.4" style={{ pointerEvents: 'none' }}><Mannequin pose={ghostPose} showOverlay={false} /></g>}
                <Mannequin pose={displayPose} showOverlay={overlayMode === 'on' || (overlayMode === 'auto' && isActivity)} visibility={visibility} focusMode={focusMode} wormMode={wormMode} hoveredPart={hoveredPart} selectedPart={selectedPart} pinnedJoints={pinnedJoints} isGrounded={isGrounded} />
                {isGrounded && <ContactMarkers pose={displayPose} active={isGrounded} />}
            </svg>
            <div className="absolute bottom-4 left-4 font-mono text-ink opacity-60 pointer-events-none select-none z-20">
                <h1 className="text-xl font-bold tracking-tighter">BITRUVIUS SQ.3</h1>
                <p className="text-[10px] font-bold text-gray-400 mt-1">FRAME: {currentFrameIndex + 1}/{frames.length} [PINS: {pinnedJoints.size}]</p>
            </div>
        </div>
      </div>

      {showControls && (
          <Controls 
            pose={frames[currentFrameIndex]} overlayMode={overlayMode} setOverlayMode={setOverlayMode} 
            onChange={handlePoseChange} onLoad={(p) => setFrames(pr => { const n = [...pr]; n[currentFrameIndex] = p; return n; })}
            frames={frames} onInteractionStart={recordHistory} 
            visibility={visibility} onToggleVisibility={(k) => setVisibility(p => ({...p, [k]: !p[k]}))} onIsolateVisibility={() => {}}
            interactiveParts={interactiveParts} onToggleInteractive={(k) => setInteractiveParts(p => { const n = new Set(p); if(n.has(k)) n.delete(k); else n.add(k); return n; })}
            manualControl={manualControl} setManualControl={setManualControl}
            stancePinLeft={stancePinLeft} setStancePinLeft={setStancePinLeft} stancePinRight={stancePinRight} setStancePinRight={setStancePinRight} pinStrength={pinStrength} setPinStrength={setPinStrength}
            waistMode={waistMode} setWaistMode={setWaistMode} hulaMomentum={hulaMomentum} setHulaMomentum={setHulaMomentum} hulaSpeed={hulaSpeed} setHulaSpeed={setHulaSpeed} hulaAmplitude={hulaAmplitude} setHulaAmplitude={setHulaAmplitude}
            jumpMode={jumpMode} setJumpMode={() => handlePhysicsToggle('JUMP')} jumpCharge={jumpCharge} setJumpCharge={setJumpCharge} jumpHeight={jumpHeight} setJumpHeight={setJumpHeight} onJumpTrigger={handleJumpTrigger} apexBehavior={apexBehavior} setApexBehavior={setApexBehavior} landingMode={landingMode} setLandingMode={setLandingMode}
            isGrounded={isGrounded} onToggleGrounded={() => handlePhysicsToggle('FLOOR')} gravity={gravity} onToggleGravity={() => setGravity(!gravity)} floorMagnetism={floorMagnetism} setFloorMagnetism={setFloorMagnetism} sitMode={sitMode} setSitMode={() => handlePhysicsToggle('SIT')} seatHeight={seatHeight} setSeatHeight={(v) => { setSeatHeight(v); handlePoseChange({}); }} tension={tension} setTension={setTension}
            conflicts={conflicts} auditMode={auditMode} setAuditMode={setAuditMode} tensionAlerts={tensionAlerts}
            systemErrors={systemErrors} focusMode={focusMode} setFocusMode={setFocusMode} onHoverControl={setGhostParam}
            balanceTargets={balanceTargets} onToggleBalance={handleBalanceToggle}
            shadowMode={shadowMode} setShadowMode={setShadowMode} shadowSkew={shadowSkew} setShadowSkew={setShadowSkew}
          />
      )}
    </div>
  );
};

export default App;