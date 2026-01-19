import React, { useState } from 'react';
import { Pose } from '../types';
import { FocusMode, WaistMode, ApexBehavior, LandingMode } from '../App';

interface ControlsProps {
  pose: Pose;
  overlayMode: 'auto' | 'on' | 'off';
  setOverlayMode: (mode: 'auto' | 'on' | 'off') => void;
  onChange: (updates: Partial<Pose>) => void;
  onLoad: (pose: Pose) => void;
  frames: Pose[];
  onInteractionStart: () => void;
  visibility: Record<string, boolean>;
  onToggleVisibility: (key: string) => void;
  onIsolateVisibility: (key: string) => void;
  interactiveParts: Set<string>;
  onToggleInteractive: (key: string) => void;
  manualControl: boolean;
  setManualControl: (v: boolean) => void;
  
  // Kinetics
  stancePinLeft: boolean;
  setStancePinLeft: (v: boolean) => void;
  stancePinRight: boolean;
  setStancePinRight: (v: boolean) => void;
  pinStrength: number;
  setPinStrength: (v: number) => void;

  waistMode: WaistMode;
  setWaistMode: (v: WaistMode) => void;
  hulaMomentum: boolean;
  setHulaMomentum: (v: boolean) => void;
  hulaSpeed: number;
  setHulaSpeed: (v: number) => void;
  hulaAmplitude: number;
  setHulaAmplitude: (v: number) => void;

  // Jump
  jumpMode: boolean;
  setJumpMode: (v: boolean) => void;
  jumpCharge: number;
  setJumpCharge: (v: number) => void;
  jumpHeight: number;
  setJumpHeight: (v: number) => void;
  onJumpTrigger: () => void;
  apexBehavior: ApexBehavior;
  setApexBehavior: (v: ApexBehavior) => void;
  landingMode: LandingMode;
  setLandingMode: (v: LandingMode) => void;

  // GLOBAL PHYSICS (Moved from Timeline)
  isGrounded: boolean;
  onToggleGrounded: () => void;
  gravity: boolean;
  onToggleGravity: () => void;
  floorMagnetism: number;
  setFloorMagnetism: (v: number) => void;
  sitMode: boolean;
  setSitMode: () => void;
  seatHeight: number;
  setSeatHeight: (v: number) => void;
  tension: number;
  setTension: (v: number) => void;

  // AUDIT & CONFLICTS
  conflicts: Record<string, string>;
  auditMode: boolean;
  setAuditMode: (v: boolean) => void;
  tensionAlerts: string[];

  systemErrors: string[];
  focusMode: FocusMode;
  setFocusMode: (mode: FocusMode) => void;

  // GHOST TRIGGER
  onHoverControl: (key: string | null) => void;
}

const Slider = ({ 
    label, value, min, max, onChange, onHover, compact = false, unit = '' 
}: { 
    label?: string, value: number, min: number, max: number, onChange: (val: number) => void, onHover?: (active: boolean) => void, compact?: boolean, unit?: string
}) => (
    <div 
        className={`flex flex-col select-none group relative ${compact ? 'mb-1' : 'mb-3'}`} 
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={() => onHover && onHover(true)}
        onPointerLeave={() => onHover && onHover(false)}
    >
        {label && (
            <div className={`flex justify-between text-[9px] font-mono mb-0.5 text-gray-600 group-hover:text-blue-600 transition-colors`}>
                <span>{label}</span>
                <span>{Math.round(value)}{unit}</span>
            </div>
        )}
        <div className="relative h-3 w-full flex items-center">
            <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full h-1 bg-gray-200 accent-gray-900 cursor-pointer hover:accent-blue-500 transition-all`} />
        </div>
    </div>
);

const SectionHeader = ({ title, expanded, onToggle }: { title: string, expanded: boolean, onToggle: () => void }) => (
  <button onClick={onToggle} className="w-full flex justify-between items-center py-2 px-1 border-b-2 border-gray-900 mb-2 group bg-white hover:bg-gray-50">
      <span className="text-[10px] font-bold font-mono tracking-widest text-gray-900">{title}</span>
      <span className="text-[10px] text-gray-900 transform transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
  </button>
);

const ConflictDot = ({ message }: { message?: string }) => {
    if (!message) return null;
    return (
        <div className="absolute -top-1 -right-1 group z-50">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-sm" />
            <div className="hidden group-hover:block absolute bottom-full right-0 mb-1 w-32 p-1 bg-red-600 text-white text-[9px] rounded-sm font-mono shadow-lg leading-tight">
                {message}
            </div>
        </div>
    );
};

const Toggle = ({ label, active, onClick, color = 'blue', conflictMsg }: { label: string, active: boolean, onClick: () => void, color?: string, conflictMsg?: string }) => (
    <button 
        onClick={onClick}
        className={`flex-1 flex items-center justify-center gap-1.5 py-1 border rounded-sm transition-all shadow-sm relative ${
            active 
            ? `bg-white border-gray-900 text-gray-900` 
            : 'bg-white border-gray-300 text-gray-400 hover:border-gray-500'
        }`}
    >
        <ConflictDot message={conflictMsg} />
        <div className={`w-1.5 h-1.5 rounded-full ${active ? (color === 'red' ? 'bg-red-500' : 'bg-cyan-500') : 'bg-gray-300'}`} />
        <span className="text-[8px] font-bold font-mono uppercase">{label}</span>
    </button>
);

export const Controls: React.FC<ControlsProps> = ({ 
    pose, overlayMode, setOverlayMode, onChange, manualControl, setManualControl,
    stancePinLeft, setStancePinLeft, stancePinRight, setStancePinRight,
    waistMode, setWaistMode, hulaMomentum, setHulaMomentum, hulaSpeed, setHulaSpeed, hulaAmplitude, setHulaAmplitude,
    jumpMode, setJumpMode, jumpCharge, setJumpCharge, jumpHeight, setJumpHeight, onJumpTrigger,
    isGrounded, onToggleGrounded, gravity, onToggleGravity, floorMagnetism, setFloorMagnetism, sitMode, setSitMode, seatHeight, setSeatHeight, tension, setTension,
    conflicts, auditMode, setAuditMode, tensionAlerts,
    systemErrors, onHoverControl
}) => {
  const [expanded, setExpanded] = useState<'refinement' | 'jump' | 'physics' | null>('refinement'); 
  
  const bind = (key: keyof Pose) => ({ 
      value: pose[key] as number, 
      onChange: (v: number) => onChange({ [key]: v }),
      onHover: (active: boolean) => onHoverControl(active ? key : null)
  });

  return (
    <div className="w-80 h-full bg-white/95 backdrop-blur-md border-l border-gray-200 shadow-xl p-4 select-none overflow-y-auto custom-scrollbar flex flex-col font-sans z-40">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 pb-2 border-b border-gray-200 mt-2">
          <span className="text-[10px] font-bold font-mono text-gray-900">REFINEMENT HUB</span>
          <button onClick={() => setManualControl(!manualControl)} className={`px-2 py-1 text-[8px] font-bold font-mono border border-gray-900 ${manualControl ? 'bg-white text-gray-900' : 'bg-gray-100 text-gray-400'}`}>{manualControl ? 'MANUAL' : 'AUTO'}</button>
      </div>

      <div className="mb-2">
        <SectionHeader title="1. JOINT DIALS" expanded={expanded === 'refinement'} onToggle={() => setExpanded(expanded === 'refinement' ? null : 'refinement')} />
        {expanded === 'refinement' && (
          <div className="px-1 animate-in fade-in">
             <div className="mb-4">
                 <div className="text-[9px] font-bold text-gray-400 mb-1">STANCE PINS</div>
                 <div className="flex gap-1">
                     <button onClick={() => setStancePinLeft(!stancePinLeft)} className={`flex-1 py-1 text-[8px] font-bold border rounded-sm ${stancePinLeft ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-300'}`}>L_PIN</button>
                     <button onClick={() => setStancePinRight(!stancePinRight)} className={`flex-1 py-1 text-[8px] font-bold border rounded-sm ${stancePinRight ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-300'}`}>R_PIN</button>
                 </div>
             </div>
             
             <div className="mb-4">
                 <div className="text-[9px] font-bold text-gray-400 mb-1">GLOBAL ROOT</div>
                 <Slider label="ROOT_X" value={pose.root.x} min={-200} max={200} onChange={(v) => onChange({ root: { ...pose.root, x: v } })} onHover={(a) => onHoverControl(a ? 'root' : null)} compact />
                 {/* Y is usually automatic, but we can visualize it */}
             </div>

             <div className="mb-4">
                 <div className="text-[9px] font-bold text-gray-400 mb-1">UPPER BODY</div>
                 <Slider label="TORSO" min={0} max={360} {...bind('torso')} compact />
                 <Slider label="NECK" min={-90} max={90} {...bind('neck')} compact />
                 <Slider label="L_SHOULDER" min={-180} max={180} {...bind('lShoulder')} compact />
                 <Slider label="R_SHOULDER" min={-180} max={180} {...bind('rShoulder')} compact />
             </div>

             <div className="mb-4">
                 <div className="text-[9px] font-bold text-gray-400 mb-1">LOWER BODY</div>
                 <Slider label="HIPS" min={-45} max={45} {...bind('hips')} compact />
                 <Slider label="L_THIGH" min={-180} max={180} {...bind('lThigh')} compact />
                 <Slider label="R_THIGH" min={-180} max={180} {...bind('rThigh')} compact />
                 <Slider label="L_CALF" min={-180} max={180} {...bind('lCalf')} compact />
                 <Slider label="R_CALF" min={-180} max={180} {...bind('rCalf')} compact />
             </div>
          </div>
        )}
      </div>

      <div className="mb-2">
         <SectionHeader title="2. DYNAMICS ENGINE" expanded={expanded === 'jump'} onToggle={() => setExpanded(expanded === 'jump' ? null : 'jump')} />
         {expanded === 'jump' && (
             <div className="px-1 animate-in fade-in">
                 <div className="mb-4 p-2 border border-orange-200 bg-orange-50 rounded-sm">
                     <div className="flex justify-between items-center mb-2">
                         <span className="text-[9px] font-bold text-orange-800">JUMP MODULE</span>
                         <button onClick={() => setJumpMode(!jumpMode)} className={`w-3 h-3 rounded-full border ${jumpMode ? 'bg-orange-500' : 'bg-white'}`} />
                     </div>
                     {jumpMode && (
                         <>
                            <Slider label="CHARGE" value={jumpCharge} min={0} max={100} onChange={setJumpCharge} compact />
                            <Slider label="APEX" value={jumpHeight} min={100} max={800} onChange={setJumpHeight} compact />
                            <button onClick={onJumpTrigger} className="w-full mt-2 py-1 bg-white border border-orange-300 text-orange-800 text-[8px] font-bold uppercase">Execute Jump</button>
                         </>
                     )}
                 </div>

                 <div className="mb-4 p-2 border border-cyan-200 bg-cyan-50 rounded-sm">
                     <div className="flex justify-between items-center mb-2">
                         <span className="text-[9px] font-bold text-cyan-800">HULA MODULE</span>
                         <button onClick={() => setWaistMode(waistMode === 'HULA' ? 'STATIC' : 'HULA')} className={`text-[8px] px-2 border rounded-sm ${waistMode === 'HULA' ? 'bg-cyan-500 text-white' : 'bg-white'}`}>{waistMode}</button>
                     </div>
                     {waistMode === 'HULA' && (
                         <>
                             <button onClick={() => setHulaMomentum(!hulaMomentum)} className="w-full mb-2 py-1 bg-white border border-cyan-300 text-cyan-800 text-[8px] font-bold uppercase">{hulaMomentum ? 'STOP' : 'START OSCILLATOR'}</button>
                             <Slider label="SPEED" value={hulaSpeed} min={1} max={10} onChange={setHulaSpeed} compact />
                             <Slider label="AMP" value={hulaAmplitude} min={0} max={100} onChange={setHulaAmplitude} compact />
                         </>
                     )}
                 </div>
             </div>
         )}
      </div>

      <div className="mb-2">
         <SectionHeader title="3. PHYSICS & AUDIT" expanded={expanded === 'physics'} onToggle={() => setExpanded(expanded === 'physics' ? null : 'physics')} />
         {expanded === 'physics' && (
             <div className="px-1 animate-in fade-in">
                 <div className="flex justify-between items-center mb-2">
                    <div className="text-[9px] font-bold font-mono text-gray-400">ENGINE CONFIG</div>
                    <button 
                        onClick={() => setAuditMode(!auditMode)}
                        className={`text-[8px] font-bold font-mono px-2 py-0.5 border rounded-sm transition-colors ${auditMode ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                    >
                        AUDIT {tensionAlerts.length > 0 && <span className="ml-1 text-red-600">({tensionAlerts.length})</span>}
                    </button>
                  </div>
                  
                  <div className="flex gap-1 mb-3">
                      <Toggle label="FLOOR" active={isGrounded} onClick={onToggleGrounded} conflictMsg={conflicts['FLOOR']} />
                      <Toggle label="GRAVITY" active={gravity} onClick={onToggleGravity} conflictMsg={conflicts['GRAVITY']} />
                      <Toggle label="SIT" active={sitMode} onClick={setSitMode} color="red" conflictMsg={conflicts['SIT']} />
                  </div>

                  <Slider label="MAGNETISM" value={floorMagnetism} min={0} max={100} onChange={setFloorMagnetism} unit="%" />
                  {sitMode && (
                       <Slider label="SEAT ELEV." value={seatHeight} min={-500} max={0} onChange={setSeatHeight} unit="px" />
                  )}
                  <Slider label="TENSION" value={tension} min={0} max={100} onChange={setTension} unit="%" />
                  
                  {conflicts['ALL_PHYSICS'] && <div className="text-[7px] text-red-500 font-mono animate-pulse mt-1 text-center">{conflicts['ALL_PHYSICS']}</div>}

                  {/* Audit Panel */}
                  {auditMode && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-sm">
                          <div className="text-[7px] font-bold text-red-400 mb-1">TENSION MONITOR</div>
                          {tensionAlerts.length === 0 ? (
                              <div className="text-[8px] text-gray-400 italic">No structural stress detected.</div>
                          ) : (
                              tensionAlerts.map((alert, i) => (
                                  <div key={i} className="text-[8px] font-mono text-red-600 mb-0.5">• {alert}</div>
                              ))
                          )}
                      </div>
                  )}
             </div>
         )}
      </div>

      {systemErrors.length > 0 && (
          <div className="mt-auto p-2 bg-red-50 border border-red-200 rounded-sm">
              <div className="text-[8px] font-mono text-red-700 font-bold mb-1">ALERTS</div>
              {systemErrors.map((err, i) => <div key={i} className="text-[8px] font-mono text-red-500 leading-tight">{err}</div>)}
          </div>
      )}
    </div>
  );
};