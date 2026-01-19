import React from 'react';
import { BoneProps, BoneVariant } from '../types';

// 1. The Bone Geometry (SVG Path)
const getBonePath = (length: number, width: number, variant: BoneVariant = 'diamond', cutout: number = 0) => {
  switch (variant) {
    case 'wedge':
      // Inverted Triangle (Torso) - Starts at pivot (0,0) and widens to end
      if (cutout > 0) {
        // Shield Torso Logic:
        // Navel (0,0) -> Shoulder Corner -> Trapezius Slope -> Neck Base -> ... Mirror
        
        const shoulderX = width / 2;
        const shoulderY = length - cutout;
        
        // Neck Base: The "Circle's Left/Right" alignment target.
        // Approx 15% of width provides a clean tangent to the neck column.
        const neckX = width * 0.15; 
        const neckY = length;

        // Fillet Radius for the Shoulder Corner
        const r = 16;
        
        // Calculate fillet start/end points to ensure smooth tangency
        // Start: On the side wall, slightly above the corner
        const startX = shoulderX - (r * 0.25); 
        const startY = shoulderY - r;

        // End: On the Trapezius slope, slightly inwards from corner
        // Slope is roughly (cutout / shoulder_to_neck_run). 
        // We approximate the landing point to keep the curve purely on the corner.
        const endX = shoulderX - r; 
        const endY = shoulderY + (cutout * 0.4); 

        return `
          M 0 0 
          L ${startX} ${startY} 
          Q ${shoulderX} ${shoulderY} ${endX} ${endY}
          L ${neckX} ${neckY}
          L ${-neckX} ${neckY}
          L ${-endX} ${endY}
          Q ${-shoulderX} ${shoulderY} ${-startX} ${startY}
          Z
        `;
      }
      return `M 0 0 L ${width / 2} ${length} L ${-width / 2} ${length} Z`;
    
    case 'pelvis':
      // Standard Triangle (Pelvis) - Starts at pivot (0,0) and widens to end (Hips)
      return `M 0 0 L ${width / 2} ${length} L ${-width / 2} ${length} Z`;

    case 'taper':
      // Neck: Wide at pivot, narrow at end
      return `M ${width/2} 0 L 0 ${length} L ${-width/2} 0 Z`;
    
    case 'column':
      // Rectangular Stick (Neck/Spine) - Constant width
      return `M ${width/2} 0 L ${width/2} ${length} L ${-width/2} ${length} L ${-width/2} 0 Z`;

    case 'arrowhead':
      // Effectors (Hands/Feet). Wide at base (pivot), point at tip.
      return `M ${width / 2} 0 L 0 ${length} L ${-width / 2} 0 Z`;

    case 'diamond':
    default:
      // Standard Limb Segment
      const split = length * 0.4; // Shift mass slightly down for visual balance
      return `M 0 0 L ${width / 2} ${split} L 0 ${length} L ${-width / 2} ${split} Z`;
  }
};

// 3. Recursive Transform Component
export const Bone: React.FC<BoneProps> = ({ 
  rotation, 
  corrective = 0,
  length, 
  width = 15, 
  variant = 'diamond',
  rounded = false,
  cutout = 0,
  decorations,
  showOverlay = true,
  visible = true,
  offset = { x: 0, y: 0 }, // Rule Breaker Offset
  children 
}) => {
  
  // --- PHASE 1: CORRECTIVE INJECTION ---
  // Apply the pivot shift logic to establish the dynamic Anchor.
  // When we apply 'corrective' (C), we rotate around the Distal point (0, L).
  // This shifts the Proximal point (0,0) to a new location.
  const rad = corrective * (Math.PI / 180);
  const shiftX = length * Math.sin(rad);
  const shiftY = length * (1 - Math.cos(rad));
  
  // --- PHASE 2: KINEMATIC ROTATION + RULE BREAKER OFFSET ---
  // Apply manual offsets (Rule Breaker) on top of algorithmic shifts
  const finalX = shiftX + offset.x;
  const finalY = shiftY + offset.y;

  const transform = corrective !== 0 || offset.x !== 0 || offset.y !== 0
    ? `translate(${finalX}, ${finalY}) rotate(${rotation + corrective})`
    : `rotate(${rotation})`;

  return (
    <g transform={transform}>
      {/* Visual Representation (Conditional) */}
      {visible && (
          <>
            <path 
                d={getBonePath(length, width, variant as BoneVariant, cutout)} 
                fill="currentColor" 
                // Rounded Logic: Use stroke to soften corners if requested
                stroke={rounded ? "currentColor" : "none"}
                strokeWidth={rounded ? width * 0.15 : 0}
                strokeLinejoin={rounded ? "round" : "miter"}
                strokeLinecap={rounded ? "round" : "butt"}
            />
            
            {/* Gesture Line (Axis) - Hidden if overlay disabled */}
            {showOverlay && (
                <line 
                    x1={0} y1={0} 
                    x2={0} y2={length} 
                    stroke="#a855f7" 
                    strokeWidth={2} 
                    opacity={0.9}
                    strokeLinecap="round"
                />
            )}
            
            {/* Decorations Layer (Holes, Buttons, etc.) */}
            {decorations && decorations.map((d, i) => {
                const y = length * d.position;
                const size = d.size || 7;
                const r = size / 2;
                const fill = d.type === 'hole' ? '#fdf6e3' : 'currentColor';
                
                return (
                <g key={`deco-${i}`} transform={`translate(0, ${y})`}>
                    {d.shape === 'circle' && (
                    <circle cx={0} cy={0} r={r} fill={fill} />
                    )}
                    {d.shape === 'square' && (
                    <rect x={-r} y={-r} width={size} height={size} fill={fill} />
                    )}
                    {d.shape === 'triangle' && (
                    <polygon points={`0,${-r} ${-r},${r} ${r},${r}`} fill={fill} />
                    )}
                </g>
                );
            })}
          </>
      )}

      {/* Recursive Children Container */}
      {/* 
         --- PHASE 3: CHILD PINNING ---
         Execute automatic counter-rotation for distal segments.
         Attached at (0, length) in the LOCAL space.
         We neutralize 'corrective' so children are purely kinematic relative to the parent's base axis.
         Global Angle = (Rotation + Corrective) - Corrective = Rotation.
      */}
      <g transform={`translate(0, ${length}) rotate(${-corrective})`}>
        {children}
      </g>

      {/* Articulation Joint (The Green Ball Pivot) */}
      {/* Renders at (0,0) of the LOCAL space (which is shifted by translate) */}
      {/* Only show if visible to avoid floating dots if parent is hidden */}
      {showOverlay && visible && (
        <circle cx="0" cy="0" r="5" fill="#15803d" />
      )}
    </g>
  );
};