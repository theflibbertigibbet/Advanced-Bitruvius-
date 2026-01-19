import React, { useState } from 'react';
import { Pose } from '../types';
import { TestMode } from '../App';

interface TimelineProps {
  frames: Pose[];
  currentFrameIndex: number;
  onSelectFrame: (index: number) => void;
  onAddFrame: () => void;
  onInsertInBetween: () => void;
  onDeleteFrame: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  isRecording: boolean;
  onToggleRecord: () => void;
  isTweening: boolean;
  onToggleTween: () => void;
  onExport: () => void;
  exportStatus: 'idle' | 'rendering' | 'zipping';
  fps: number;
  onChangeFps: (fps: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Test Deck
  testMode: TestMode;
  setTestMode: (m: TestMode) => void;
  onResetTPose: () => void;

  // New Joint Control Props (Moved from Controls)
  pose: Pose;
  onChange: (updates: Partial<Pose>) => void;
  onHoverControl: (key: string | null) => void;
  balanceTargets: Map<string, number>;
  onToggleBalance: (key: string) => void;
  stancePinLeft: boolean;
  setStancePinLeft: (v: boolean) => void;
  stancePinRight: boolean;
  setStancePinRight: (v: boolean) => void;
}

// Re-implementing Slider locally for Timeline use
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

const SectionHeader = ({ title, isOpen, onToggle }: { title: string, isOpen: boolean, onToggle: () => void }) => (
    <button 
        onClick={onToggle} 
        className="w-full flex justify-between items-center py-2 border-b border-gray-100 mb-2 mt-1 group hover:bg-gray-50 transition-colors focus:outline-none"
    >
        <span className="text-[10px] font-bold font-mono tracking-widest text-gray-900 group-hover:text-blue-600 transition-colors">{title}</span>
        <span className={`text-[8px] text-gray-400 transform transition-transform duration-200 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>▶</span>
    </button>
);

export const Timeline: React.FC<TimelineProps> = ({
  frames, currentFrameIndex, onSelectFrame, onAddFrame, onInsertInBetween, onDeleteFrame,
  isPlaying, onTogglePlay, isRecording, onToggleRecord, isTweening, onToggleTween,
  onExport, exportStatus, fps, onChangeFps, onUndo, onRedo, canUndo, canRedo,
  testMode, setTestMode, onResetTPose,
  pose, onChange, onHoverControl, balanceTargets, onToggleBalance, stancePinLeft, setStancePinLeft, stancePinRight, setStancePinRight
}) => {
  const [viewMode, setViewMode] = useState<'EDITOR' | 'SEQUENCER'>('EDITOR');
  const [sections, setSections] = useState({ global: true, upper: true, lower: true });
  
  const toggleSection = (key: keyof typeof sections) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const bind = (key: keyof Pose) => ({ 
      value: pose[key] as number, 
      onChange: (v: number) => onChange({ [key]: v }),
      onHover: (active: boolean) => onHoverControl(active ? key : null),
      balanceKey: key,
      isBalanced: balanceTargets.has(key),
      onToggleBalance: onToggleBalance
  });

  return (
    <div className="w-80 h-full bg-white/95 backdrop-blur-md border-r border-gray-200 shadow-xl flex flex-col pointer-events-auto select-none z-40">
      
      {/* 1. VIEW SWITCHER */}
      <div className="flex border-b border-gray-200">
          <button 
            onClick={() => setViewMode('EDITOR')}
            className={`flex-1 py-3 text-[10px] font-bold font-mono tracking-wider transition-colors ${viewMode === 'EDITOR' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
          >
              JOINT EDITOR
          </button>
          <button 
            onClick={() => setViewMode('SEQUENCER')}
            className={`flex-1 py-3 text-[10px] font-bold font-mono tracking-wider transition-colors ${viewMode === 'SEQUENCER' ? 'bg-white text-purple-600 border-b-2 border-purple-600' : 'bg-gray-50 text-gray-400 hover:text-gray-600'}`}
          >
              SEQUENCER
          </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-gray-50/30">
        
        {/* === MODE: JOINT EDITOR === */}
        {viewMode === 'EDITOR' && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                 <div className="mb-6">
                     <div className="text-[9px] font-bold text-gray-400 mb-2">STANCE PINS</div>
                     <div className="flex gap-2">
                         <button onClick={() => setStancePinLeft(!stancePinLeft)} className={`flex-1 py-2 text-[9px] font-bold border rounded-sm transition-all hover:shadow-sm ${stancePinLeft ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'}`}>L_PIN</button>
                         <button onClick={() => setStancePinRight(!stancePinRight)} className={`flex-1 py-2 text-[9px] font-bold border rounded-sm transition-all hover:shadow-sm ${stancePinRight ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'}`}>R_PIN</button>
                     </div>
                 </div>
                 
                 <div className="mb-2">
                     <SectionHeader title="GLOBAL OFFSET" isOpen={sections.global} onToggle={() => toggleSection('global')} />
                     {sections.global && (
                        <div className="pl-1 animate-in fade-in slide-in-from-top-1">
                            <Slider label="ROOT_X" value={pose.root.x} min={-200} max={200} onChange={(v) => onChange({ root: { ...pose.root, x: v } })} onHover={(a) => onHoverControl(a ? 'root' : null)} compact />
                        </div>
                     )}
                 </div>

                 <div className="mb-2">
                     <SectionHeader title="UPPER BODY" isOpen={sections.upper} onToggle={() => toggleSection('upper')} />
                     {sections.upper && (
                        <div className="pl-1 animate-in fade-in slide-in-from-top-1">
                             <Slider label="TORSO" min={0} max={360} {...bind('torso')} compact />
                             <Slider label="NECK" min={-90} max={90} {...bind('neck')} compact />
                             <div className="h-3" />
                             <Slider label="L_SHOULDER" min={-180} max={180} {...bind('lShoulder')} compact />
                             <Slider label="R_SHOULDER" min={-180} max={180} {...bind('rShoulder')} compact />
                             <div className="h-3" />
                             <Slider label="L_FOREARM" min={-180} max={180} {...bind('lForearm')} compact />
                             <Slider label="R_FOREARM" min={-180} max={180} {...bind('rForearm')} compact />
                             <div className="h-3" />
                             <Slider label="L_HAND" min={-90} max={90} {...bind('lWrist')} compact />
                             <Slider label="R_HAND" min={-90} max={90} {...bind('rWrist')} compact />
                        </div>
                     )}
                 </div>

                 <div className="mb-2">
                     <SectionHeader title="LOWER BODY" isOpen={sections.lower} onToggle={() => toggleSection('lower')} />
                     {sections.lower && (
                        <div className="pl-1 animate-in fade-in slide-in-from-top-1">
                             <Slider label="HIPS" min={-45} max={45} {...bind('hips')} compact />
                             <div className="h-3" />
                             <Slider label="L_THIGH" min={-180} max={180} {...bind('lThigh')} compact />
                             <Slider label="R_THIGH" min={-180} max={180} {...bind('rThigh')} compact />
                             <div className="h-3" />
                             <Slider label="L_SHIN" min={-180} max={180} {...bind('lCalf')} compact />
                             <Slider label="R_SHIN" min={-180} max={180} {...bind('rCalf')} compact />
                             <div className="h-3" />
                             <Slider label="L_FOOT" min={-90} max={90} {...bind('lAnkle')} compact />
                             <Slider label="R_FOOT" min={-90} max={90} {...bind('rAnkle')} compact />
                        </div>
                     )}
                 </div>
            </div>
        )}

        {/* === MODE: SEQUENCER === */}
        {viewMode === 'SEQUENCER' && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-200">
                {/* TRANSPORT */}
                <div className="p-3 border border-gray-200 rounded-sm bg-white mb-4">
                    <div className="flex gap-2 mb-3">
                        <button onClick={onTogglePlay} className={`flex-1 py-2 text-[9px] font-bold font-mono border rounded-sm transition-all hover:shadow-sm ${isPlaying ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-ink border-gray-300 hover:border-gray-400'}`}>
                            {isPlaying ? 'PAUSE' : 'PLAY'}
                        </button>
                        <button onClick={onToggleRecord} className={`w-14 py-2 text-[9px] font-bold font-mono border rounded-sm transition-all hover:shadow-sm ${isRecording ? 'bg-red-600 text-white border-red-700 animate-pulse' : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'}`}>
                            REC
                        </button>
                    </div>
                    <div className="flex gap-2 mb-3">
                        <button onClick={onUndo} disabled={!canUndo} className="flex-1 py-1.5 bg-gray-50 border border-gray-200 rounded-sm text-[9px] font-bold disabled:opacity-50 hover:bg-white transition-colors">UNDO</button>
                        <button onClick={onRedo} disabled={!canRedo} className="flex-1 py-1.5 bg-gray-50 border border-gray-200 rounded-sm text-[9px] font-bold disabled:opacity-50 hover:bg-white transition-colors">REDO</button>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-mono text-gray-400 font-bold">FPS</span>
                        <input type="range" min={1} max={30} value={fps} onChange={e => onChangeFps(parseInt(e.target.value))} className="flex-1 h-1.5 bg-gray-200 rounded-full accent-gray-900 cursor-pointer" />
                        <span className="text-[9px] font-mono font-bold w-4 text-right">{fps}</span>
                    </div>
                </div>

                {/* FRAMES */}
                <div className="mb-4">
                     <h4 className="text-[9px] font-bold text-gray-400 mb-2">KEYFRAMES</h4>
                     <div className="grid grid-cols-4 gap-2">
                        {frames.map((_, i) => (
                            <div 
                                key={i} onClick={() => onSelectFrame(i)}
                                className={`
                                    aspect-square border rounded-sm cursor-pointer flex items-center justify-center transition-all relative group hover:shadow-md
                                    ${i === currentFrameIndex ? 'bg-white border-purple-500 shadow-sm' : 'bg-gray-100 border-gray-200 hover:bg-white hover:border-gray-300'}
                                `}
                            >
                                <span className={`text-[10px] font-mono font-bold ${i === currentFrameIndex ? 'text-purple-600' : 'text-gray-400'}`}>{i+1}</span>
                                {i === currentFrameIndex && <div className="absolute bottom-1.5 w-1.5 h-1.5 bg-purple-500 rounded-full" />}
                            </div>
                        ))}
                        <button onClick={onAddFrame} className="aspect-square border-2 border-dashed border-gray-300 rounded-sm flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 hover:bg-white text-[16px] font-bold transition-all">+</button>
                    </div>
                </div>
                
                {/* TEST DECK (Moved to Sequencer View) */}
                <div className="p-3 bg-gray-100 rounded-sm border border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[9px] font-bold font-mono text-gray-500">TEST DECK</span>
                        <span className={`text-[8px] font-mono ${testMode !== 'IDLE' ? 'text-red-500 animate-pulse' : 'text-gray-300'}`}>{testMode}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        {['TAFFY', 'RAGDOLL', 'RUBBERBOARD', 'CHAOS'].map(mode => (
                            <button 
                                key={mode}
                                onClick={() => setTestMode(testMode === mode ? 'IDLE' : mode as TestMode)}
                                className={`py-2 text-[8px] font-bold font-mono border rounded-sm truncate transition-all hover:shadow-sm ${
                                    testMode === mode 
                                    ? 'border-gray-900 text-gray-900 bg-white' 
                                    : 'border-gray-300 text-gray-500 bg-white hover:border-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {mode.replace('_', ' ')}
                            </button>
                        ))}
                    </div>
                    <button onClick={onResetTPose} className="w-full py-2.5 bg-white border border-red-200 text-red-600 text-[9px] font-bold rounded-sm hover:bg-red-50 hover:border-red-300 transition-all uppercase tracking-wider shadow-sm active:translate-y-0.5">
                        RESET T-POSE
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};