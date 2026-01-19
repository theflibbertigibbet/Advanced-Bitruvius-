import { Pose } from './types';

// 1 Head Unit in Pixels (Scaling Factor)
export const HEAD_UNIT = 55;

// Anatomical Ratios (Refined for Geometric Facsimile)
export const ANATOMY = {
  // Heights / Lengths
  HEAD: 1.0 * HEAD_UNIT,
  NECK: 0.5 * HEAD_UNIT,
  
  // Upper Body Growth: +1.5 Units
  TORSO: 4.5 * HEAD_UNIT, 
  
  PELVIS: 2.0 * HEAD_UNIT, // Prominent Base Triangle
  
  // Limbs - Elongated geometric look
  // Adjusted to 2.5 to match Height/Span ratio (13.5H Height vs ~13.8H Span)
  UPPER_ARM: 2.5 * HEAD_UNIT,
  // SQ.7 UPDATE: Shortened forearm to fix visual elongation (2.5 -> 2.1)
  LOWER_ARM: 2.1 * HEAD_UNIT,
  HAND: 0.8 * HEAD_UNIT,
  
  // Lower Body Growth: +1.5 Units Total (0.75 per segment)
  LEG_UPPER: 3.25 * HEAD_UNIT,
  LEG_LOWER: 3.25 * HEAD_UNIT,
  
  // Single Foot segment (merged length)
  FOOT: 1.0 * HEAD_UNIT, 
  
  // Widths (Geometric shapes) - Bulked up for "Fixed Proportions"
  SHOULDER_WIDTH: 2.2 * HEAD_UNIT, 
  HIP_WIDTH: 2.0 * HEAD_UNIT,      
  NECK_BASE: 0.6 * HEAD_UNIT,      
  
  // Limb Thickness (for Diamond shapes)
  LIMB_WIDTH_ARM: 0.9 * HEAD_UNIT, 
  LIMB_WIDTH_FOREARM: 0.4 * HEAD_UNIT, 
  // Thicker legs
  LIMB_WIDTH_THIGH: 0.95 * HEAD_UNIT, 
  LIMB_WIDTH_CALF: 0.75 * HEAD_UNIT,  
  EFFECTOR_WIDTH: 0.35 * HEAD_UNIT,   
};

// RIGGING CONSTANTS (Internal Offsets)
// Exported to ensure IK Solver matches Visual Mannequin exactly
export const RIGGING = {
    SHOULDER_INSET: 5,
    SHOULDER_LIFT: 0, // Flattened for horizontal clavicle line
    CLAVICLE_EXTENSION: 0.5 * HEAD_UNIT,
    NECK_SINK: 0, // Aligned with Shoulders to share the same anchor
};

// VISUAL CONSTANTS
// Centered Ground Line Logic:
// Pelvis (2.0 * 55 = 110) + Leg Upper (178.75) + Leg Lower (178.75) = 467.5px total length from Navel.
// Setting Floor to 467.5 ensures the default T-Pose (Root=0) stands perfectly on the floor.
export const FLOOR_HEIGHT = 467.5; 

// SYSTEM BIOS: Factory Default State (T-Pose Baseline)
// This serves as the universal "Ground Truth" for all kinematic operations.
export const DEFAULT_POSE: Pose = {
  root: { x: 0, y: 0 }, // Navel at World Origin (CPU Anchor)
  rootRotation: 0, // Global rotation around the anchor
  hips: 0, // Waist/Pelvis rotation
  torso: 180, // Vertical Up (Upright)
  neck: 0,
  lShoulder: 0, // T-pose (Parallel to ground)
  lBicepCorrective: -12, // User-defined depth correction
  lForearm: 0,
  lWrist: 0,
  rShoulder: 0,
  rBicepCorrective: 12, // User-defined depth correction (Mirrored)
  rForearm: 0,
  rWrist: 0,
  lThigh: 0,
  lThighCorrective: 5, // Splays the hip connection inward
  lCalf: 0,
  lAnkle: 0,
  rThigh: 0,
  rThighCorrective: -5, // Splays the hip connection inward
  rCalf: 0,
  rAnkle: 0,
  offsets: {}
};