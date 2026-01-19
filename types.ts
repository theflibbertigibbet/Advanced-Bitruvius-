import React from 'react';

// The "Cartridge" is a collection of pre-calculated states (Poses)
// that drives the Core Anatomy Template.
export type Cartridge = Record<string, Pose>;

export interface Sequence {
  frames: Pose[];
  fps: number;
}

export interface Pose {
  root: { x: number; y: number }; // Global position of the Navel/Pelvis anchor
  rootRotation?: number; // Global rotation around the anchor
  hips: number; // New: Waist Pivot (Lower body rotation relative to navel)
  torso: number;
  neck: number;
  lShoulder: number;
  lBicepCorrective: number; // Secondary pivot for L Upper Arm
  lForearm: number;
  lWrist: number;
  rShoulder: number;
  rBicepCorrective: number; // Secondary pivot for R Upper Arm
  rForearm: number;
  rWrist: number;
  lThigh: number;
  lThighCorrective: number; // Secondary pivot for L Thigh
  lCalf: number;
  lAnkle: number;
  // Toes removed
  rThigh: number;
  rThighCorrective: number; // Secondary pivot for R Thigh
  rCalf: number;
  rAnkle: number;
  // Toes removed
  
  // Dynamic Stretch (Elasticity)
  lLegStretch?: number;
  rLegStretch?: number;
  
  // Rule Breaker Engine: XYZ offsets for breaking kinematic chains
  offsets?: Record<string, { x: number; y: number }>;
}

export interface Decoration {
  position: number; // Normalized position (0.0 to 1.0) along the bone
  shape: 'circle' | 'square' | 'triangle';
  type: 'hole' | 'filled'; // 'hole' renders background color, 'filled' renders foreground color
  size?: number; // Diameter or side length
}

export type BoneVariant = 'diamond' | 'wedge' | 'pelvis' | 'arrowhead' | 'taper' | 'column';

export interface BoneProps {
  rotation: number;
  corrective?: number; // Optional secondary rotation around the END of the bone
  length: number;
  width?: number;
  stretch?: number; // Dynamic elasticity extension
  variant?: BoneVariant;
  rounded?: boolean;
  cutout?: number; // Depth of cutout at the end of the bone (for V-necks, etc.)
  decorations?: Decoration[];
  showOverlay?: boolean; // If true, renders the rigging (lines/joints). If false, silhouette only.
  visible?: boolean; // New: Controls visual rendering without breaking hierarchy
  offset?: { x: number; y: number }; // Rule Breaker Offset
  children?: React.ReactNode;
}