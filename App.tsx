import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

// --- COMPONENTS ---
import { Mannequin } from './components/Mannequin';
import { Controls } from './components/Controls';
import { Timeline } from './components/Timeline';
import { SystemGrid } from './components/SystemGrid';

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
    getMaxPoseDeviation 
} from './utils/kinematics';

// --- DOMAIN TYPES ---
interface HistoryState { frames: Pose[]; index: number; }
export type FocusMode = 'all' | 'core' | 'upper' | 'lower';
export type ApexBehavior = 'FREEZE' | 'FLOAT' | 'FALL';
export type WaistMode = 'STATIC' | 'HULA';
export type LandingMode = 'STANCE' | 'CHARGE';
export type TestMode = 'IDLE' | 'TAFFY' | 'RAGDOLL' | 'RUBBERBOARD' | 'CHAOS';
export type PhysicsMode = 'NONE' | 'FLOOR' | 'SIT' | 'JUMP';

// --- HELPER COMPONENTS ---
const ContactMarkers = ({ pose, active }: { pose: Pose, active: boolean }) => {
    if (!active) return null;
    const joints = getJointPositions(pose);
    const points = [joints.lFootTip, joints.rFootTip, joints.lAnkle, joints.rAnkle];
    const contacts = points.filter(p => Math.abs(p.y - FLOOR_HEIGHT) < 5);
    return (
        <g className="pointer-events-none">
            {contacts.map((p, i) => (
                <g key={i} transform={`translate(${p.x}, ${FLOOR_HEIGHT})`}>
                    <line x1="-6" y1="0" x2="6" y2="0" stroke="#3b82f6" strokeWidth="2" />
                    <line x1="0" y1="-6" x2="0" y2="6" stroke="#3b82f6" strokeWidth="2" />
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
  
  // 3. PHYSICS CONFIGURATION
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
  const [stancePinLeft, setStancePinLeft] = useState(false);
  const [stancePinRight, setStancePinRight] = useState(false);
  const [pinStrength, setPinStrength] = useState(100);

  // 4. DYNAMICS ENGINE (JUMP)
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
  
  // 6. REFS (MUTABLE BRIDGES)
  const svgRef = useRef<SVGSVGElement>(null);
  const lastMousePos = useRef<{x: number, y: number} | null>(null);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chaosLogs = useRef<{ frame: number, type: 'break' | 'tension', message: string, pose: Pose }[]>([]);
  
  // Live Parameter Bridge for Loops (Avoids stale closures)
  const physicsRefs = useRef({
      hulaSpeed, hulaAmplitude, floorMagnetism, gravity, tension, seatHeight
  });
  useEffect(() => { 
      physicsRefs.current = { hulaSpeed, hulaAmplitude, floorMagnetism, gravity, tension, seatHeight }; 
  }, [hulaSpeed, hulaAmplitude, floorMagnetism, gravity, tension, seatHeight]);

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
      
      if (tension < 100 && !dragTarget) {
          const relaxed = applyLimbLimpness(raw);
          const t = tension / 100;
          const blended: any = { ...raw };
          ['lShoulder', 'rShoulder', 'lThigh', 'rThigh', 'lForearm', 'rForearm', 'lCalf', 'rCalf'].forEach(key => {
             // @ts-ignore
             blended[key] = lerp(relaxed[key], raw[key], t);
          });
          return blended as Pose;
      }
      return raw;
  }, [frames, currentFrameIndex, isPlaying, isTweening, tension, dragTarget]);

  // --- HELPERS ---
  const recordHistory = useCallback(() => { 
      setPast(prev => [...prev, { frames, index: currentFrameIndex }]); 
      setFuture([]); 
  }, [frames, currentFrameIndex]);

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

  const handleTestModeChange = (mode: TestMode) => {
      if (testMode === 'CHAOS' && mode !== 'CHAOS') { setIsRecording(false); handleExportSequence(); }
      if (mode === 'CHAOS') { setFrames([DEFAULT_POSE]); setCurrentFrameIndex(0); chaosLogs.current = []; setIsRecording(true); }
      if (mode !== 'IDLE') { setIsGrounded(true); setSitMode(false); setJumpMode(false); }
      setTestMode(mode);
  };

  const handleResetTPose = () => {
      handleTestModeChange('IDLE');
      setSitMode(false); setJumpMode(false); setJumpPhase('idle');
      setIsGrounded(true); setWaistMode('STATIC'); setHulaMomentum(false);
      setStancePinLeft(false); setStancePinRight(false); setPinnedJoints(new Map());
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
  useEffect(() => {
      if (testMode !== 'IDLE') return;
      const joints = getJointPositions(displayPose);
      setPinnedJoints(prev => {
          const next = new Map(prev);
          if (stancePinLeft) { if (!next.has('lFoot')) next.set('lFoot', joints.lAnkle); } else { next.delete('lFoot'); }
          if (stancePinRight) { if (!next.has('rFoot')) next.set('rFoot', joints.rAnkle); } else { next.delete('rFoot'); }
          return next;
      });
  }, [stancePinLeft, stancePinRight, testMode]); // Dep on displayPose would loop, handled by interactions

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
    
    // Quick Solve for Ghost Pins
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

  // 4. TEST DECK SIMULATION LOOP
  useEffect(() => {
      if (testMode === 'IDLE') return;
      let frameId: number;
      const startTime = performance.now();
      
      const runTest = (time: number) => {
          const t = (time - startTime) / 1000;
          let updates: Partial<Pose> = {};
          
          if (testMode === 'TAFFY') {
             const j = getJointPositions(frames[currentFrameIndex]);
             const pins = new Map<string, {x:number, y:number}>();
             pins.set('lHand', { x: -ANATOMY.SHOULDER_WIDTH, y: -500 });
             pins.set('rHand', { x: ANATOMY.SHOULDER_WIDTH, y: -500 });
             pins.set('lFoot', { x: j.lHip.x, y: FLOOR_HEIGHT });
             pins.set('rFoot', { x: j.rHip.x, y: FLOOR_HEIGHT });
             setPinnedJoints(pins);
             updates.root = { x: 0, y: Math.sin(t * 5) * 60 };
             updates.torso = 180;
          } else if (testMode === 'RUBBERBOARD') {
             const pins = new Map<string, {x:number, y:number}>();
             pins.set('lFoot', { x: -30, y: FLOOR_HEIGHT });
             pins.set('rFoot', { x: 30, y: FLOOR_HEIGHT });
             setPinnedJoints(pins);
             setTension(100);
             updates.root = { x: 0, y: (Math.abs(Math.cos(t * 8)) * 120) - 60 };
          } else if (testMode === 'RAGDOLL') {
              if (jumpPhase === 'idle' && Math.random() < 0.05) { handleJumpTrigger(); setTension(0); }
          } else if (testMode === 'CHAOS') {
              const pins = new Map<string, {x:number, y:number}>();
              pins.set('lFoot', { x: -ANATOMY.HIP_WIDTH/2, y: FLOOR_HEIGHT });
              setPinnedJoints(pins);
              if (Math.random() > 0.5) setGravity(Math.random() > 0.5);
              if (Math.random() > 0.5) setTension(Math.random() * 100);
              if (Math.random() > 0.5) setFloorMagnetism(Math.random() * 100);
              updates.torso = 180 + Math.sin(t*2) * 20;
              updates.hips = Math.cos(t*3) * 30;
              updates.lShoulder = Math.sin(t*4) * 160;
              updates.rShoulder = Math.cos(t*5) * 160;
              updates.root = { x: Math.sin(t) * 100, y: Math.cos(t) * 50 };
          }

          if (Object.keys(updates).length > 0 || pinnedJoints.size > 0) {
              setFrames(prev => {
                  const next = [...prev];
                  let nextPose = { ...next[currentFrameIndex], ...updates };
                  
                  if (testMode !== 'RAGDOLL') {
                      if (gravity) {
                        const mag = floorMagnetism / 100; 
                        nextPose = resolveFinalGrounding(nextPose, FLOOR_HEIGHT, mag, sitMode, seatHeight); 
                      } else {
                        nextPose.root.x = lerp(nextPose.root.x, 0, 0.05);
                        nextPose.root.y = lerp(nextPose.root.y, 0, 0.05);
                      }
                  }
                  
                  if (pinnedJoints.size > 0) {
                        const j = getJointPositions(nextPose);
                        const alerts: string[] = [];
                        pinnedJoints.forEach((tgt, key) => {
                            if (key.includes('Foot')) {
                                const isR = key === 'rFoot';
                                const res = solveTwoBoneIK(nextPose.rootRotation||0, nextPose.hips, isR?j.rHip:j.lHip, tgt, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1, tension);
                                if (isR) { nextPose.rThigh = res.thigh; nextPose.rCalf = res.calf; } else { nextPose.lThigh = res.thigh; nextPose.lCalf = res.calf; }
                                if (res.stretch > 0) {
                                    const m = `BREAKAGE: ${key} +${res.stretch.toFixed(1)}px`;
                                    alerts.push(m);
                                    if (testMode === 'CHAOS' && Math.random() < 0.1) chaosLogs.current.push({ frame: prev.length, type: 'break', message: m, pose: nextPose });
                                }
                            } else if (key.includes('Hand')) {
                                const isR = key === 'rHand';
                                const cr = (nextPose.rootRotation||0) + nextPose.torso;
                                const res = solveTwoBoneIK(cr, isR?90:-90, isR?j.rShoulder:j.lShoulder, tgt, ANATOMY.UPPER_ARM, ANATOMY.LOWER_ARM, isR?1:-1, tension);
                                if (isR) { nextPose.rShoulder = res.thigh; nextPose.rForearm = res.calf; } else { nextPose.lShoulder = res.thigh; nextPose.lForearm = res.calf; }
                            }
                        });
                        if (auditMode) setTensionAlerts(alerts);
                  }

                  nextPose = clampPoseToBox(nextPose, 1200);
                  if (testMode === 'CHAOS') return [...prev, nextPose];
                  else { const n = [...prev]; n[currentFrameIndex] = nextPose; return n; }
              });
              if (testMode === 'CHAOS') setCurrentFrameIndex(p => p + 1);
          }
          frameId = requestAnimationFrame(runTest);
      };
      frameId = requestAnimationFrame(runTest);
      return () => cancelAnimationFrame(frameId);
  }, [testMode, currentFrameIndex, isGrounded, sitMode, seatHeight, floorMagnetism, jumpPhase, pinnedJoints, tension, auditMode, gravity]);

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
                 if (isLeaningLeft) { next.lThigh = pivotRes.thigh; next.lCalf = pivotRes.calf; } else { next.rThigh = pivotRes.thigh; next.rCalf = pivotRes.calf; }
                 
                 const liftHeight = Math.max(0, (Math.abs(sine) * p.hulaAmplitude) - 20); 
                 const passiveFootPos = { x: passiveTarget.x + (swayX * 0.2), y: FLOOR_HEIGHT - liftHeight }; 
                 const passiveRes = solveTwoBoneIK(next.rootRotation||0, next.hips, isLeaningLeft ? j.rHip : j.lHip, passiveFootPos, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1);
                 if (isLeaningLeft) { next.rThigh = passiveRes.thigh; next.rCalf = passiveRes.calf; next.rAnkle = 20 + (sine * 10); } else { next.lThigh = passiveRes.thigh; next.lCalf = passiveRes.calf; next.lAnkle = 20 + (sine * 10); }
                 
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
        candidate.rThigh = rr.thigh; candidate.rCalf = rr.calf; candidate.rAnkle = rr.ankle;
        candidate.lThigh = lr.thigh; candidate.lCalf = lr.calf; candidate.lAnkle = lr.ankle;
    }
    else if (isGrounded && !jumpMode) {
        candidate = resolveFinalGrounding(candidate, FLOOR_HEIGHT, floorMagnetism/100, false, 0); 
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
              const nextPins = new Map(pinnedJoints);
              nextPins.forEach((pos, k) => nextPins.set(k, { x: pos.x + d.x*slide, y: pos.y + d.y*slide }));
              setPinnedJoints(nextPins);
              const tp = { ...p, ...updates }; const tj = getJointPositions(tp);
              nextPins.forEach((pos, k) => {
                   if (k.includes('Foot')) {
                       const isR = k === 'rFoot';
                       const r = solveTwoBoneIK(tp.rootRotation||0, tp.hips||0, isR?tj.rHip:tj.lHip, pos, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1, tension);
                       if (isR) { updates.rThigh = r.thigh; updates.rCalf = r.calf; } else { updates.lThigh = r.thigh; updates.lCalf = r.calf; }
                   }
              });
          }
      } else {
          // Limb Drag
          const j = getJointPositions(p);
          const isIK = e.ctrlKey || e.metaKey || (stancePinLeft && dragTarget === 'lFoot') || (stancePinRight && dragTarget === 'rFoot');
          if (isIK && dragTarget.includes('Foot')) {
              const isR = dragTarget === 'rFoot';
              const r = solveTwoBoneIK(p.rootRotation||0, p.hips, isR?j.rHip:j.lHip, mouse, ANATOMY.LEG_UPPER, ANATOMY.LEG_LOWER, 1, tension);
              if (isR) { updates.rThigh = r.thigh; updates.rCalf = r.calf; } else { updates.lThigh = r.thigh; updates.lCalf = r.calf; }
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
          />
      )}

      <div className="flex-1 relative z-10 flex items-center justify-center bg-gray-100 shadow-inner">
        <button onClick={() => setShowTimeline(!showTimeline)} className="absolute top-4 left-4 z-50 p-2 bg-white/80 border border-gray-300 rounded-full hover:bg-white shadow-sm transition-all">{showTimeline ? '◀' : '▶'}</button>
        <button onClick={() => setShowControls(!showControls)} className="absolute top-4 right-4 z-50 p-2 bg-white/80 border border-gray-300 rounded-full hover:bg-white shadow-sm transition-all">{showControls ? '▶' : '◀'}</button>

        <div className="relative aspect-square h-[95%] max-h-[95%] w-auto max-w-[95%] bg-paper border-2 border-gray-900 rounded-lg shadow-2xl overflow-hidden ring-4 ring-gray-200">
            <SystemGrid floorY={FLOOR_HEIGHT} dimGround={!isGrounded} sitMode={sitMode} seatHeight={seatHeight} />
            <svg 
                ref={svgRef} width="100%" height="100%" viewBox="-600 -600 1200 1200" 
                className={`overflow-visible ${manualControl ? 'cursor-crosshair' : 'cursor-default'}`}
                onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={() => setDragTarget(null)} onPointerLeave={() => setDragTarget(null)}
            >
                {jumpMode && <JumpGhost pose={displayPose} jumpHeight={jumpHeight} />}
                {ghostPose && <g opacity="0.4" style={{ pointerEvents: 'none' }}><Mannequin pose={ghostPose} showOverlay={false} /></g>}
                <Mannequin pose={displayPose} showOverlay={overlayMode === 'on' || (overlayMode === 'auto' && isActivity)} visibility={visibility} focusMode={focusMode} wormMode={wormMode} hoveredPart={hoveredPart} selectedPart={selectedPart} pinnedJoints={pinnedJoints} />
                {isGrounded && <ContactMarkers pose={displayPose} active={isGrounded} />}
            </svg>
            <div className="absolute bottom-4 left-4 font-mono text-ink opacity-60 pointer-events-none select-none z-0">
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
          />
      )}
    </div>
  );
};

export default App;