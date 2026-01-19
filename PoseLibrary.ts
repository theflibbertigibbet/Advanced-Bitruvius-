import { Pose, Cartridge } from './types';
import { DEFAULT_POSE } from './constants';

/*
 * ======================================================================================
 * SYSTEM INSTRUCTIONS: MODULAR CARTRIDGE ENGINE
 * ======================================================================================
 * 
 * CORE DIRECTIVE:
 * This file acts as a swappable "Software Cartridge" for the Bitruvius Core "Hardware".
 * All logic inside this cartridge must be TEMPLATE-AGNOSTIC.
 * 
 * ROTATION ENGINE PROTOCOL:
 * 1. Corrective Injection: Pivot shifts are applied via `corrective` values.
 * 2. Kinematic Rotation: Limbs rotate around the dynamic shifted anchor.
 * 3. Child Pinning: Distal segments (Forearms/Calves) are counter-rotated automatically
 *    by the Core Template to maintain global orientation.
 * 4. Verlet Verification: Ensure all hard-saved angles here have been validated 
 *    against physics/distance constraints before saving.
 * 
 * ======================================================================================
 */

export const PoseLibrary: Cartridge = {
  "VITRUVIAN_T": DEFAULT_POSE,
  "MUSEUM_A": {
    ...DEFAULT_POSE,
    hips: 0,
    lShoulder: -75,
    lBicepCorrective: 0,
    rShoulder: 75,
    rBicepCorrective: 0,
    lThigh: -5,
    lThighCorrective: -2,
    rThigh: 5,
    rThighCorrective: 2,
    lForearm: 10,
    rForearm: -10
  },
  "DESIGN_WALK": {
    ...DEFAULT_POSE,
    hips: 0,
    lThigh: 20,
    lCalf: 10,
    lAnkle: -15,
    rThigh: -15,
    rCalf: 25,
    rAnkle: 5,
    lShoulder: 15,
    rShoulder: -15,
    lForearm: 30,
    rForearm: 20
  },
  "CONTRA_POSTO": {
    ...DEFAULT_POSE,
    root: { x: 0, y: 10 },
    hips: -5, // Slight hip tilt
    lThigh: 5,
    lCalf: 0,
    rThigh: 15,
    rCalf: 30, // Bent knee
    rAnkle: -20, // Toe touch
    torso: 175, // Slight tilt
    neck: 5,
    lShoulder: -5,
    rShoulder: 5
  }
};