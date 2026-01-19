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
  
  // BALANCE
  balanceTargets: Map<string, number>;
  onToggleBalance: (key: string) => void;
}

const Slider = ({ 
    label, value, min, max, onChange, onHover, compact = false, unit = '', 
    balanceKey, isBalanced, onToggleBalance 
}: { 
    label?: string, value: number, min: number, max: number, onChange: (val: number) => void, onHover?: (active: boolean) => void, compact?: boolean, unit?: string,
    balanceKey?: string, isBalanced?: boolean, onToggleBalance?: (k: string) => void
}) => (
    <div 
        className={`flex flex-col select-none group relative ${compact ? 'mb-1' : 'mb-3'}`} 
        onPointerDown={(e) => e.stopPropagation()}
        onPointerEnter={() => onHover && onHover(true)}
        onPointerLeave={() => onHover && onHover(false)}
    >
        {label && (
            <div className={`flex justify-between items-center text-[9px] font-mono mb-1 text-gray-600 group-hover:text-blue-600 transition-colors`}>
                <div className="flex items-center gap-2">
                    <span>{label}</span>
                    {onToggleBalance && balanceKey && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleBalance(balanceKey); }}
                            className={`w-4 h-4 flex items-center justify-center rounded-sm border transition-all ${isBalanced ? 'bg-indigo-500 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-400 hover:border-gray-400'}`}
                            title="Visual Balance Lock"
                        >
                            ⚓
                        </button>
                    )}
                </div>
                <span>{Math.round(value)}{unit}</span>
            </div>
        )}
        <div className="relative h-4 w-full flex items-center">
            <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full h-1.5 bg-gray-200 accent-gray-900 cursor-pointer hover:accent-blue-500 transition-all rounded-full`} />
        </div>
    </div>
);

const SectionHeader = ({ title, expanded, onToggle }: { title: string, expanded: boolean, onToggle: () => void }) => (
  <button onClick={onToggle} className="w-full flex justify-between items-center py-3 px-2 border-b-2 border-gray-900 mb-2 group bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors">
      <span className="text-[10px] font-bold font-mono tracking-widest text-gray-900">{title}</span>
      <span className="text-[10px] text-gray-900 transform transition-transform" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
  </button>
);

const ConflictDot = ({ message }: { message?: string }) => {
    if (!message) return null;
    return (
        <div className="absolute -top-1 -right-1 group z-50">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-sm ring-1 ring-white" />
            <div className="hidden group-hover:block absolute bottom-full right-0 mb-1 w-32 p-1.5 bg-red-600 text-white text-[9px] rounded-sm font-mono shadow-lg leading-tight z-50">
                {message}
            </div>
        </div>
    );
};

const Toggle = ({ label, active, onClick, color = 'blue', conflictMsg }: { label: string, active: boolean, onClick: () => void, color?: string, conflictMsg?: string }) => (
    <button 
        onClick={onClick}
        className={`flex-1 flex items-center justify-center gap-2 py-2 px-1 border rounded-sm transition-all shadow-sm relative hover:shadow-md ${
            active 
            ? `bg-white border-gray-900 text-gray-900` 
            : 'bg-white border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600'
        }`}
    >
        <ConflictDot message={conflictMsg} />
        <div className={`w-2 h-2 rounded-full ring-1 ring-offset-1 ${active ? (color === 'red' ? 'bg-red-500 ring-red-500' : 'bg-cyan-500 ring-cyan-500') : 'bg-gray-300 ring-transparent'}`} />
        <span className="text-[9px] font-bold font-mono uppercase tracking-tight">{label}</span>
    </button>
);

export const Controls: React.FC<ControlsProps> = ({ 
    pose, overlayMode, setOverlayMode, onChange, manualControl, setManualControl,
    stancePinLeft, setStancePinLeft, stancePinRight, setStancePinRight,
    waistMode, setWaistMode, hulaMomentum, setHulaMomentum, hulaSpeed, setHulaSpeed, hulaAmplitude, setHulaAmplitude,
    jumpMode, setJumpMode, jumpCharge, setJumpCharge, jumpHeight, setJumpHeight, onJumpTrigger,
    isGrounded, onToggleGrounded, gravity, onToggleGravity, floorMagnetism, setFloorMagnetism, sitMode, setSitMode, seatHeight, setSeatHeight, tension, setTension,
    conflicts, auditMode, setAuditMode, tensionAlerts,
    systemErrors, onHoverControl,
    balanceTargets, onToggleBalance
}) => {
  const [expanded, setExpanded] = useState<'refinement' | 'jump' | 'physics' | null>('refinement'); 
  
  const bind = (key: keyof Pose) => ({ 
      value: pose[key] as number, 
      onChange: (v: number) => onChange({ [key]: v }),
      onHover: (active: boolean) => onHoverControl(active ? key : null),
      balanceKey: key,
      isBalanced: balanceTargets.has(key),
      onToggleBalance: onToggleBalance
  });

  return (
    <div className="w-80 h-full bg-white/95 backdrop-blur-md border-l border-gray-200 shadow-xl p-4 select-none overflow-y-auto custom-scrollbar flex flex-col font-sans z-40">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 pb-2 border-b border-gray-200 mt-2">
          <span className="text-[10px] font-bold font-mono text-gray-900">REFINEMENT HUB</span>
          <button 
            onClick={() => setManualControl(!manualControl)} 
            className={`px-3 py-1.5 text-[9px] font-bold font-mono border border-gray-900 rounded-sm transition-colors ${manualControl ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
              {manualControl ? 'MANUAL' : 'AUTO'}
          </button>
      </div>

      <div className="mb-2">
        <SectionHeader title="1. JOINT DIALS" expanded={expanded === 'refinement'} onToggle={() => setExpanded(expanded === 'refinement' ? null : 'refinement')} />
        {expanded === 'refinement' && (
          <div className="px-1 animate-in fade-in">
             <div className="mb-5">
                 <div className="text-[9px] font-bold text-gray-400 mb-2">STANCE PINS</div>
                 <div className="flex gap-2">
                     <button onClick={() => setStancePinLeft(!stancePinLeft)} className={`flex-1 py-2 text-[9px] font-bold border rounded-sm transition-all hover:shadow-sm ${stancePinLeft ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'}`}>L_PIN</button>
                     <button onClick={() => setStancePinRight(!stancePinRight)} className={`flex-1 py-2 text-[9px] font-bold border rounded-sm transition-all hover:shadow-sm ${stancePinRight ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'}`}>R_PIN</button>
                 </div>
             </div>
             
             <div className="mb-5">
                 <div className="text-[9px] font-bold text-gray-400 mb-2">GLOBAL ROOT</div>
                 <Slider label="ROOT_X" value={pose.root.x} min={-200} max={200} onChange={(v) => onChange({ root: { ...pose.root, x: v } })} onHover={(a) => onHoverControl(a ? 'root' : null)} compact />
             </div>

             <div className="mb-5">
                 <div className="text-[9px] font-bold text-gray-400 mb-2">UPPER BODY</div>
                 <Slider label="TORSO" min={0} max={360} {...bind('torso')} compact />
                 <Slider label="NECK" min={-90} max={90} {...bind('neck')} compact />
                 <Slider label="L_SHOULDER" min={-180} max={180} {...bind('lShoulder')} compact />
                 <Slider label="R_SHOULDER" min={-180} max={180} {...bind('rShoulder')} compact />
             </div>

             <div className="mb-2">
                 <div className="text-[9px] font-bold text-gray-400 mb-2">LOWER BODY</div>
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
                 <div className={`mb-4 border rounded-sm transition-all ${jumpMode ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200 bg-gray-50/30'}`}>
                     <button 
                        onClick={() => setJumpMode(!jumpMode)} 
                        className={`w-full flex justify-between items-center p-3 transition-colors hover:bg-white/50 focus:outline-none`}
                     >
                         <span className={`text-[9px] font-bold ${jumpMode ? 'text-orange-800' : 'text-gray-500'}`}>JUMP MODULE</span>
                         <div className={`w-3 h-3 rounded-full border shadow-sm transition-colors ${jumpMode ? 'bg-orange-500 border-orange-600' : 'bg-white border-gray-300'}`} />
                     </button>
                     
                     {jumpMode && (
                         <div className="p-2 pt-0">
                            <Slider label="CHARGE (CROUCH)" value={jumpCharge} min={0} max={100} onChange={setJumpCharge} compact unit="%" />
                            <Slider label="APEX HEIGHT" value={jumpHeight} min={100} max={800} onChange={setJumpHeight} compact unit="px" />
                            <button onClick={onJumpTrigger} className="w-full mt-2 py-2 bg-white border border-orange-300 text-orange-800 text-[9px] font-bold uppercase rounded-sm shadow-sm hover:bg-orange-50 active:translate-y-0.5 transition-all">Execute Jump</button>
                         </div>
                     )}
                 </div>

                 <div className={`mb-4 border rounded-sm transition-all ${waistMode === 'HULA' ? 'border-cyan-300 bg-cyan-50/50' : 'border-gray-200 bg-gray-50/30'}`}>
                     <button 
                        onClick={() => setWaistMode(waistMode === 'HULA' ? 'STATIC' : 'HULA')}
                        className="w-full flex justify-between items-center p-3 transition-colors hover:bg-white/50 focus:outline-none"
                     >
                         <span className={`text-[9px] font-bold ${waistMode === 'HULA' ? 'text-cyan-800' : 'text-gray-500'}`}>HULA MODULE</span>
                         <div className={`px-2 py-0.5 text-[8px] font-bold border rounded-sm ${waistMode === 'HULA' ? 'bg-cyan-500 text-white border-cyan-600' : 'bg-gray-100 text-gray-400 border-gray-300'}`}>
                             {waistMode}
                         </div>
                     </button>
                     
                     {waistMode === 'HULA' && (
                         <div className="p-2 pt-0">
                             <button onClick={() => setHulaMomentum(!hulaMomentum)} className="w-full mb-3 py-2 bg-white border border-cyan-300 text-cyan-800 text-[9px] font-bold uppercase rounded-sm shadow-sm hover:bg-cyan-50 active:translate-y-0.5 transition-all">{hulaMomentum ? 'STOP' : 'START OSCILLATOR'}</button>
                             <Slider label="SPEED" value={hulaSpeed} min={1} max={10} onChange={setHulaSpeed} compact />
                             <Slider label="AMPLITUDE" value={hulaAmplitude} min={0} max={100} onChange={setHulaAmplitude} compact />
                         </div>
                     )}
                 </div>
             </div>
         )}
      </div>

      <div className="mb-2">
         <SectionHeader title="3. PHYSICS & AUDIT" expanded={expanded === 'physics'} onToggle={() => setExpanded(expanded === 'physics' ? null : 'physics')} />
         {expanded === 'physics' && (
             <div className="px-1 animate-in fade-in">
                 <div className="flex justify-between items-center mb-3">
                    <div className="text-[9px] font-bold font-mono text-gray-400">ENGINE CONFIG</div>
                    <button 
                        onClick={() => setAuditMode(!auditMode)}
                        className={`text-[8px] font-bold font-mono px-3 py-1 border rounded-sm transition-all ${auditMode ? 'bg-red-50 text-red-700 border-red-300' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}
                    >
                        AUDIT {tensionAlerts.length > 0 && <span className="ml-1 text-red-600">({tensionAlerts.length})</span>}
                    </button>
                  </div>
                  
                  <div className="flex gap-2 mb-4">
                      <Toggle label="FLOOR" active={isGrounded} onClick={onToggleGrounded} conflictMsg={conflicts['FLOOR']} />
                      <Toggle label="GRAVITY" active={gravity} onClick={onToggleGravity} conflictMsg={conflicts['GRAVITY']} />
                      <Toggle label="SIT" active={sitMode} onClick={setSitMode} color="red" conflictMsg={conflicts['SIT']} />
                  </div>

                  <Slider label="MAGNETISM" value={floorMagnetism} min={0} max={100} onChange={setFloorMagnetism} unit="%" />
                  {sitMode && (
                       <Slider label="SEAT ELEV." value={seatHeight} min={-500} max={0} onChange={setSeatHeight} unit="px" />
                  )}
                  <Slider label="TENSION" value={tension} min={0} max={100} onChange={setTension} unit="%" />
                  
                  {conflicts['ALL_PHYSICS'] && <div className="text-[8px] text-red-500 font-mono animate-pulse mt-2 text-center p-1 border border-red-200 bg-red-50 rounded-sm">{conflicts['ALL_PHYSICS']}</div>}

                  {/* Audit Panel */}
                  {auditMode && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-sm">
                          <div className="text-[8px] font-bold text-red-400 mb-2 border-b border-red-100 pb-1">TENSION MONITOR</div>
                          {tensionAlerts.length === 0 ? (
                              <div className="text-[9px] text-gray-400 italic">No structural stress detected.</div>
                          ) : (
                              tensionAlerts.map((alert, i) => (
                                  <div key={i} className="text-[9px] font-mono text-red-600 mb-0.5 flex items-start">
                                      <span className="mr-1">•</span> {alert}
                                  </div>
                              ))
                          )}
                      </div>
                  )}
             </div>
         )}
      </div>

      {systemErrors.length > 0 && (
          <div className="mt-auto p-3 bg-red-50 border border-red-200 rounded-sm shadow-sm">
              <div className="text-[9px] font-mono text-red-700 font-bold mb-1 flex items-center">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse" />
                  SYSTEM ALERTS
              </div>
              {systemErrors.map((err, i) => <div key={i} className="text-[9px] font-mono text-red-500 leading-tight pl-4">{err}</div>)}
          </div>
      )}
    </div>
  );
};