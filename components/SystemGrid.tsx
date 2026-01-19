import React from 'react';
import { HEAD_UNIT } from '../constants';

interface SystemGuidesProps {
  floorY: number;
  dimGround?: boolean;
  sitMode?: boolean;
  seatHeight?: number;
}

// 1. The CSS Pattern Background (Infinite Visual)
export const GridBackground = () => {
  const smallGridSize = HEAD_UNIT / 4;
  const largeGridSize = HEAD_UNIT;
  
  const gridStyle = {
    backgroundImage: `
      linear-gradient(rgba(216, 222, 233, 0.7) 1px, transparent 1px),
      linear-gradient(90deg, rgba(216, 222, 233, 0.7) 1px, transparent 1px),
      linear-gradient(rgba(229, 233, 240, 0.5) 1px, transparent 1px),
      linear-gradient(90deg, rgba(229, 233, 240, 0.5) 1px, transparent 1px)
    `,
    backgroundSize: `
      ${largeGridSize}px ${largeGridSize}px,
      ${largeGridSize}px ${largeGridSize}px,
      ${smallGridSize}px ${smallGridSize}px,
      ${smallGridSize}px ${smallGridSize}px
    `,
    backgroundPosition: 'center center'
  };
  
  return <div className="absolute inset-0 w-full h-full pointer-events-none opacity-60" style={gridStyle} />;
};

// 2. The SVG Guides (Strictly aligned to ViewBox)
export const SystemGuides: React.FC<SystemGuidesProps> = ({ floorY, dimGround = false, sitMode = false, seatHeight = 0 }) => {
  return (
    <g className="pointer-events-none">
        {/* Polar Guide (Centered on CPU/Navel 0,0) */}
        <g opacity="0.15">
            {/* Concentric Distance Rings */}
            {[1, 2, 3, 4, 5, 6, 8, 10].map(r => (
                <g key={r}>
                    <circle cx="0" cy="0" r={r * HEAD_UNIT} fill="none" stroke="#1a1b26" strokeWidth={r % 5 === 0 ? 2 : 1} />
                    <text 
                      x={r * HEAD_UNIT + 4} 
                      y={3} 
                      fontSize="9" 
                      fontFamily="monospace" 
                      fill="#1a1b26" 
                      fontWeight="bold"
                    >
                      {r}H
                    </text>
                </g>
            ))}
            
            {/* Radial Rotation Guides */}
            {Array.from({ length: 12 }).map((_, i) => {
                const deg = i * 30;
                return (
                     <g key={deg} transform={`rotate(${deg})`}>
                        <line x1="0" y1="0" x2="800" y2="0" stroke="#1a1b26" strokeWidth={0.5} strokeDasharray="4 4" />
                     </g>
                )
            })}
        </g>

        {/* Global Axes Crosshair */}
        <line x1="-1000" y1="0" x2="1000" y2="0" stroke="#88c0d0" strokeWidth="1" opacity="0.6" strokeDasharray="10 5" />
        <line x1="0" y1="-1000" x2="0" y2="1000" stroke="#88c0d0" strokeWidth="1" opacity="0.6" strokeDasharray="10 5" />

        {/* Floor Line - RENDERED AT EXACT COORDINATE */}
        <g opacity={dimGround ? 0.3 : 1.0} style={{ transition: 'opacity 0.3s ease' }}>
            <line x1="-1000" y1={floorY} x2="1000" y2={floorY} stroke="#88c0d0" strokeWidth="2" />
            <text x="320" y={floorY - 10} fill="#88c0d0" fontSize="10" fontFamily="monospace" fontWeight="bold" letterSpacing="1px">GROUND_PLANE_ZERO</text>
        </g>
        
        {/* Seat Line (Sit Mode) */}
        {sitMode && (
            <g style={{ transition: 'opacity 0.3s ease' }}>
                <line 
                    x1="-1000" 
                    y1={seatHeight} 
                    x2="1000" 
                    y2={seatHeight} 
                    stroke="#eab308" 
                    strokeWidth="2" 
                    strokeDasharray="8 4"
                />
                <text x="320" y={seatHeight - 10} fill="#eab308" fontSize="10" fontFamily="monospace" fontWeight="bold" letterSpacing="1px">SEAT_ELEVATION</text>
            </g>
        )}
    </g>
  );
};