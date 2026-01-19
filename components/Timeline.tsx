import React from 'react';
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
}

export const Timeline: React.FC<TimelineProps> = ({
  frames, currentFrameIndex, onSelectFrame, onAddFrame, onInsertInBetween, onDeleteFrame,
  isPlaying, onTogglePlay, isRecording, onToggleRecord, isTweening, onToggleTween,
  onExport, exportStatus, fps, onChangeFps, onUndo, onRedo, canUndo, canRedo,
  testMode, setTestMode, onResetTPose
}) => {
  
  return (
    <div className="w-80 h-full bg-white/95 backdrop-blur-md border-r border-gray-200 shadow-xl flex flex-col pointer-events-auto select-none z-40">
      
      {/* 1. HEADER & TRANSPORT */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-[10px] font-bold font-mono text-ink/80 tracking-wider mb-3">TIMELINE & SEQUENCER</h3>
        
        <div className="flex gap-1 mb-2">
             <button onClick={onTogglePlay} className={`flex-1 py-1 text-[9px] font-bold font-mono border rounded-sm ${isPlaying ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-ink border-gray-300'}`}>
                  {isPlaying ? 'PAUSE' : 'PLAY'}
              </button>
              <button onClick={onToggleRecord} className={`w-12 py-1 text-[9px] font-bold font-mono border rounded-sm ${isRecording ? 'bg-red-600 text-white border-red-700 animate-pulse' : 'bg-white text-gray-500 border-gray-300'}`}>
                  REC
              </button>
        </div>
        <div className="flex gap-1 mb-3">
             <button onClick={onUndo} disabled={!canUndo} className="flex-1 py-1 bg-gray-50 border border-gray-200 rounded-sm text-[8px] font-bold disabled:opacity-50">UNDO</button>
             <button onClick={onRedo} disabled={!canRedo} className="flex-1 py-1 bg-gray-50 border border-gray-200 rounded-sm text-[8px] font-bold disabled:opacity-50">REDO</button>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-[8px] font-mono text-gray-400">FPS</span>
            <input type="range" min={1} max={30} value={fps} onChange={e => onChangeFps(parseInt(e.target.value))} className="flex-1 h-1 bg-gray-200" />
            <span className="text-[8px] font-mono">{fps}</span>
        </div>
      </div>

      {/* 2. FRAMES LIST (Middle - Grows) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 bg-gray-50/30">
          <div className="grid grid-cols-4 gap-1">
              {frames.map((_, i) => (
                <div 
                    key={i} onClick={() => onSelectFrame(i)}
                    className={`
                        aspect-square border rounded-sm cursor-pointer flex items-center justify-center transition-all relative group
                        ${i === currentFrameIndex ? 'bg-white border-purple-500 shadow-sm' : 'bg-gray-100 border-gray-200 hover:bg-white'}
                    `}
                >
                    <span className={`text-[9px] font-mono font-bold ${i === currentFrameIndex ? 'text-purple-600' : 'text-gray-400'}`}>{i+1}</span>
                    {i === currentFrameIndex && <div className="absolute bottom-1 w-1 h-1 bg-purple-500 rounded-full" />}
                </div>
              ))}
              <button onClick={onAddFrame} className="aspect-square border border-dashed border-gray-300 rounded-sm flex items-center justify-center text-gray-400 hover:text-ink hover:bg-white text-[12px] font-bold">+</button>
          </div>
      </div>

      {/* 3. TEST DECK */}
      <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-bold font-mono text-gray-400">TEST DECK</span>
              <span className={`text-[8px] font-mono ${testMode !== 'IDLE' ? 'text-red-500 animate-pulse' : 'text-gray-300'}`}>{testMode}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
              {['TAFFY', 'RAGDOLL', 'RUBBERBOARD', 'CHAOS'].map(mode => (
                  <button 
                    key={mode}
                    onClick={() => setTestMode(testMode === mode ? 'IDLE' : mode as TestMode)}
                    className={`py-1.5 text-[7px] font-bold font-mono border rounded-sm truncate transition-all ${
                        testMode === mode 
                        ? 'border-gray-900 text-gray-900 bg-transparent' 
                        : 'border-gray-300 text-gray-500 bg-transparent hover:border-gray-500'
                    }`}
                  >
                      {mode.replace('_', ' ')}
                  </button>
              ))}
          </div>
          <button onClick={onResetTPose} className="w-full py-2 bg-transparent border-2 border-red-200 text-red-600 text-[9px] font-bold rounded-sm hover:bg-red-50 transition-colors uppercase tracking-wider">
              RESET T-POSE
          </button>
      </div>

    </div>
  );
};