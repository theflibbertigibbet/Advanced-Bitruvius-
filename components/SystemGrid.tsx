import React from 'react';
import { HEAD_UNIT } from '../constants';

interface SystemGridProps {
  floorY: number;
  dimGround?: boolean;
  sitMode?: boolean;
  seatHeight?: number;
}

export const SystemGrid: React.FC<SystemGridProps> = ({ floorY, dimGround = false, sitMode = false, seatHeight = 0 }) => {
  const smallGridSize = HEAD_UNIT / 4;
  const largeGridSize = HEAD_UNIT;

  // CSS Pattern for the infinite cartesian plane
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

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none" style={gridStyle}>
      <svg className="absolute inset-0 w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
        
        {/* Polar Guide (Centered on CPU/Navel) */}
        <svg x="50%" y="50%" className="overflow-visible">
            <g opacity="0.15">
                {/* Concentric Distance Rings (Head Units) */}
                {/* Reduced from 8 to 6 to "Shrink the Circle" visually */}
                {[1, 2, 3, 4, 5, 6].map(r => (
                    <g key={r}>
                        <circle cx="0" cy="0" r={r * HEAD_UNIT} fill="none" stroke="#1a1b26" strokeWidth="1" />
                        {/* Measurement Labels */}
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
                {Array.from({ length: 24 }).map((_, i) => {
                    const deg = i * 15;
                    const isCardinal = deg % 90 === 0;
                    const isMajor = deg % 45 === 0;
                    
                    return (
                         <g key={deg} transform={`rotate(${deg})`}>
                            <line 
                              x1="0" 
                              y1="0" 
                              x2={6 * HEAD_UNIT + 50} 
                              y2="0" 
                              stroke="#1a1b26" 
                              strokeWidth={isCardinal ? 1 : 0.5} 
                              strokeDasharray={isMajor ? "none" : "4 4"} 
                            />
                            {/* Angle Labels (Only for major angles to reduce noise) */}
                            {isMajor && (
                              <text 
                                x={6 * HEAD_UNIT + 10} 
                                y="-4" 
                                fontSize="9" 
                                fontFamily="monospace" 
                                fill="#1a1b26" 
                                transform={`rotate(${-deg} ${6 * HEAD_UNIT + 10} -4)`}
                              >
                                {deg}°
                              </text>
                            )}
                         </g>
                    )
                })}
            </g>
        </svg>

        {/* Global Axes Crosshair */}
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#88c0d0" strokeWidth="1" opacity="0.6" strokeDasharray="10 5" />
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#88c0d0" strokeWidth="1" opacity="0.6" strokeDasharray="10 5" />

        {/* Floor Line */}
        <g opacity={dimGround ? 0.3 : 1.0} style={{ transition: 'opacity 0.3s ease' }}>
            <line x1="0" y1={`calc(50% + ${floorY}px)`} x2="100%" y2={`calc(50% + ${floorY}px)`} stroke="#88c0d0" strokeWidth="2" />
            <text x="20" y={`calc(50% + ${floorY}px - 10)`} fill="#88c0d0" fontSize="10" fontFamily="monospace" fontWeight="bold" letterSpacing="1px">GROUND_PLANE_ZERO</text>
        </g>
        
        {/* Seat Line (Sit Mode) */}
        {sitMode && (
            <g style={{ transition: 'opacity 0.3s ease' }}>
                <line 
                    x1="0" 
                    y1={`calc(50% + ${seatHeight}px)`} 
                    x2="100%" 
                    y2={`calc(50% + ${seatHeight}px)`} 
                    stroke="#eab308" 
                    strokeWidth="2" 
                    strokeDasharray="8 4"
                />
                <text x="120" y={`calc(50% + ${seatHeight}px - 10)`} fill="#eab308" fontSize="10" fontFamily="monospace" fontWeight="bold" letterSpacing="1px">SEAT_ELEVATION</text>
            </g>
        )}

      </svg>
    </div>
  );
};