import { Pose } from '../types';
import { ANATOMY, RIGGING, HEAD_UNIT } from '../constants';

export const IK_REMOVED = false;

const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

// Interpolate between two full Poses
export const interpolatePose = (poseA: Pose, poseB: Pose, t: number): Pose => {
  const clampedT = Math.max(0, Math.min(1, t));
  const result: any = { ...poseA };
  
  result.root = {
    x: lerp(poseA.root.x, poseB.root.x, clampedT),
    y: lerp(poseA.root.y, poseB.root.y, clampedT),
  };
  
  result.rootRotation = lerp(poseA.rootRotation || 0, poseB.rootRotation || 0, clampedT);

  Object.keys(poseA).forEach((key) => {
    if (key === 'root' || key === 'rootRotation' || key === 'offsets') return;
    const valA = (poseA as any)[key];
    const valB = (poseB as any)[key];
    if (typeof valA === 'number' && typeof valB === 'number') {
      result[key] = lerp(valA, valB, clampedT);
    }
  });

  // Handle Rule Breaker Offsets
  result.offsets = {};
  const allOffsetKeys = new Set([...Object.keys(poseA.offsets || {}), ...Object.keys(poseB.offsets || {})]);
  allOffsetKeys.forEach(key => {
    const offA = poseA.offsets?.[key] || { x: 0, y: 0 };
    const offB = poseB.offsets?.[key] || { x: 0, y: 0 };
    result.offsets[key] = {
      x: lerp(offA.x, offB.x, clampedT),
      y: lerp(offA.y, offB.y, clampedT)
    };
  });

  return result as Pose;
};

/**
 * Calculates the maximum deviation between two poses.
 */
export const getMaxPoseDeviation = (poseA: Pose, poseB: Pose): number => {
    let maxDiff = 0;
    const dx = poseA.root.x - poseB.root.x;
    const dy = poseA.root.y - poseB.root.y;
    maxDiff = Math.max(maxDiff, Math.sqrt(dx * dx + dy * dy));
    maxDiff = Math.max(maxDiff, Math.abs((poseA.rootRotation || 0) - (poseB.rootRotation || 0)));

    const keys = Object.keys(poseA) as Array<keyof Pose>;
    for (const key of keys) {
        if (key === 'root' || key === 'rootRotation' || key === 'offsets') continue;
        const valA = poseA[key];
        const valB = poseB[key];
        if (typeof valA === 'number' && typeof valB === 'number') {
            maxDiff = Math.max(maxDiff, Math.abs(valA - valB));
        }
    }
    
    // Check offsets
    const allOffsetKeys = new Set([...Object.keys(poseA.offsets || {}), ...Object.keys(poseB.offsets || {})]);
    allOffsetKeys.forEach(key => {
         const offA = poseA.offsets?.[key] || { x: 0, y: 0 };
         const offB = poseB.offsets?.[key] || { x: 0, y: 0 };
         const dist = Math.sqrt(Math.pow(offA.x - offB.x, 2) + Math.pow(offA.y - offB.y, 2));
         maxDiff = Math.max(maxDiff, dist);
    });

    return maxDiff;
};

// --- FORWARD KINEMATICS ENGINE ---

const rad = (deg: number) => deg * Math.PI / 180;
const rotateVec = (x: number, y: number, angleDeg: number) => {
    const r = rad(angleDeg);
    const c = Math.cos(r);
    const s = Math.sin(r);
    return {
        x: x * c - y * s,
        y: x * s + y * c
    };
};
const addVec = (v1: {x:number, y:number}, v2: {x:number, y:number}) => ({ x: v1.x + v2.x, y: v1.y + v2.y });

// Helper to calculate the Global Angle of a specific bone
export const getGlobalAngle = (pose: Pose, part: string): number => {
    const root = pose.rootRotation || 0;
    // Hierarchy Accumulators
    const hips = root + pose.hips;
    const torso = root + pose.torso;
    
    // Arm Bases (Mannequin.tsx hardcoded offsets)
    // R_Arm Rotation in Render = 90 + pose.rShoulder
    // L_Arm Rotation in Render = -(90 + pose.lShoulder) = -90 - pose.lShoulder
    // This helper returns the "Visual" global angle
    
    switch (part) {
        case 'root': return root;
        case 'hips': return hips; // Visual Angle of Pelvis
        case 'torso': return torso;
        case 'neck': return torso + pose.neck;
        
        case 'rThigh': return hips + pose.rThigh;
        case 'rCalf': return hips + pose.rThigh + pose.rCalf;
        case 'lThigh': return hips + pose.lThigh;
        case 'lCalf': return hips + pose.lThigh + pose.lCalf;

        case 'rShoulder': return torso + 90 + pose.rShoulder;
        case 'rForearm': return torso + 90 + pose.rShoulder + pose.rForearm;
        case 'lShoulder': return torso - 90 - pose.lShoulder;
        case 'lForearm': return torso - 90 - pose.lShoulder + pose.lForearm;
        
        default: return 0;
    }
};

// Calculates the local rotation needed to achieve a Target Global Angle
export const solveCounterRotation = (pose: Pose, part: string, targetGlobal: number): number => {
    const root = pose.rootRotation || 0;
    const hips = root + pose.hips;
    const torso = root + pose.torso;

    switch (part) {
        // Hips (Child of Root) -> Target = Root + Local => Local = Target - Root
        case 'hips': return targetGlobal - root;
        case 'torso': return targetGlobal - root;
        case 'neck': return targetGlobal - torso;

        // Legs (Child of Hips)
        case 'rThigh': return targetGlobal - hips;
        case 'rCalf': return targetGlobal - (hips + pose.rThigh);
        case 'lThigh': return targetGlobal - hips;
        case 'lCalf': return targetGlobal - (hips + pose.lThigh);

        // Arms (Child of Torso)
        // R_Global = Torso + 90 + R_Local => R_Local = Target - Torso - 90
        case 'rShoulder': return targetGlobal - torso - 90;
        case 'rForearm': return targetGlobal - (torso + 90 + pose.rShoulder);
        
        // L_Global = Torso - 90 - L_Local => L_Local = Torso - 90 - Target
        // Logic: Target = T - 90 - L  =>  L = T - 90 - Target
        case 'lShoulder': return torso - 90 - targetGlobal;
        case 'lForearm': return (torso - 90 - pose.lShoulder) - targetGlobal; // Wait, LForearm in render is +LForearm relative to LShoulder?
        // Let's re-verify L-Arm stack in Mannequin.tsx
        // L_Shoulder Group: rotate(-(90+lShoulder))
        //   L_Forearm Group: rotate(lForearm) -> This is additive to the parent group!
        // So L_Forearm Global = (Torso - 90 - lShoulder) + lForearm
        // Target = (T - 90 - L_S) + L_F
        // L_F = Target - (T - 90 - L_S)
        // Re-correcting lForearm case:
        // case 'lForearm': return targetGlobal - (torso - 90 - pose.lShoulder);
        
        default: return 0;
    }
};

export const getJointPositions = (pose: Pose) => {
    const { root, rootRotation = 0 } = pose;
    const offsets = pose.offsets || {};

    const globalAnglePelvis = rootRotation + pose.hips;
    const pelvisVec = rotateVec(0, ANATOMY.PELVIS, globalAnglePelvis);
    const pelvisEnd = addVec(root, pelvisVec);

    const getLegJoints = (side: 'left' | 'right') => {
        const isRight = side === 'right';
        const thighAngle = isRight ? pose.rThigh : pose.lThigh;
        const calfAngle = isRight ? pose.rCalf : pose.lCalf;
        const ankleAngle = isRight ? pose.rAnkle : pose.lAnkle;
        
        const hipOffsetX = isRight ? ANATOMY.HIP_WIDTH/4 : -ANATOMY.HIP_WIDTH/4;
        const hipOffsetVec = rotateVec(hipOffsetX, 0, globalAnglePelvis);
        const hipJoint = addVec(pelvisEnd, hipOffsetVec);
        
        const angleThighGlobal = globalAnglePelvis + thighAngle;
        const thighVec = rotateVec(0, ANATOMY.LEG_UPPER, angleThighGlobal);
        const kneeJoint = addVec(hipJoint, thighVec);
        
        const angleCalfGlobal = angleThighGlobal + calfAngle;
        const calfVec = rotateVec(0, ANATOMY.LEG_LOWER, angleCalfGlobal);
        const ankleJoint = addVec(kneeJoint, calfVec);
        
        const footBaseAngle = isRight ? -90 : 90;
        const angleFootGlobal = angleCalfGlobal + footBaseAngle + ankleAngle;
        const footVec = rotateVec(0, ANATOMY.FOOT, angleFootGlobal);
        const footTip = addVec(ankleJoint, footVec);
        
        return { hip: hipJoint, knee: kneeJoint, ankle: ankleJoint, footTip };
    };

    const rightLeg = getLegJoints('right');
    const leftLeg = getLegJoints('left');

    const globalAngleTorso = rootRotation + pose.torso;
    const torsoVec = rotateVec(0, ANATOMY.TORSO, globalAngleTorso);
    const neckBase = addVec(root, torsoVec);
    
    const globalAngleNeck = globalAngleTorso + pose.neck;
    const headVec = rotateVec(0, ANATOMY.NECK + ANATOMY.HEAD, globalAngleNeck);
    const headTop = addVec(neckBase, headVec);

    const getArmJoints = (side: 'left' | 'right') => {
        const isRight = side === 'right';
        const shoulderAngle = isRight ? pose.rShoulder : pose.lShoulder;
        const forearmAngle = isRight ? pose.rForearm : pose.lForearm;
        const wristAngle = isRight ? pose.rWrist : pose.lWrist;

        const halfWidth = ANATOMY.SHOULDER_WIDTH/2 - RIGGING.SHOULDER_INSET + RIGGING.CLAVICLE_EXTENSION;
        const sx = isRight ? -halfWidth : halfWidth;
        const sy = RIGGING.SHOULDER_LIFT;
        
        const boneOffset = offsets[isRight ? 'rShoulder' : 'lShoulder'] || {x:0, y:0};
        const effectiveSX = sx + boneOffset.x;
        const effectiveSY = sy + boneOffset.y;
        
        const shoulderOffsetVec = rotateVec(effectiveSX, effectiveSY, globalAngleTorso);
        const shoulderJoint = addVec(root, shoulderOffsetVec);

        const baseArmAngle = isRight ? 90 : -90;
        const effectiveShoulderAngle = isRight 
            ? baseArmAngle + shoulderAngle 
            : baseArmAngle - shoulderAngle;
            
        const globalAngleArm = globalAngleTorso + effectiveShoulderAngle;
        const armVec = rotateVec(0, ANATOMY.UPPER_ARM, globalAngleArm);
        const elbowJoint = addVec(shoulderJoint, armVec);
        
        const globalAngleForearm = globalAngleArm + forearmAngle;
        const forearmVec = rotateVec(0, ANATOMY.LOWER_ARM, globalAngleForearm);
        const wristJoint = addVec(elbowJoint, forearmVec);
        
        const globalAngleHand = globalAngleForearm + wristAngle;
        const handVec = rotateVec(0, ANATOMY.HAND, globalAngleHand);
        const handTip = addVec(wristJoint, handVec);
        
        return { shoulder: shoulderJoint, elbow: elbowJoint, wrist: wristJoint, handTip };
    };

    const rightArm = getArmJoints('right');
    const leftArm = getArmJoints('left');

    return {
        lHip: leftLeg.hip, rHip: rightLeg.hip,
        lKnee: leftLeg.knee, rKnee: rightLeg.knee,
        lAnkle: leftLeg.ankle, rAnkle: rightLeg.ankle,
        lFootTip: leftLeg.footTip, rFootTip: rightLeg.footTip,
        neckBase, headTop,
        lShoulder: leftArm.shoulder, rShoulder: rightArm.shoulder,
        lElbow: leftArm.elbow, rElbow: rightArm.elbow,
        lWrist: leftArm.wrist, rWrist: rightArm.wrist,
        lHandTip: leftArm.handTip, rHandTip: rightArm.handTip
    };
};

export const resolveFinalGrounding = (pose: Pose, floorHeight: number, magnetism: number, sitMode: boolean = false, seatHeight: number = 0): Pose => {
    let finalPose = { ...pose };
    const joints = getJointPositions(finalPose);

    if (sitMode) {
        const lowestHipY = Math.max(joints.lHip.y, joints.rHip.y);
        const seatPenetration = lowestHipY - seatHeight;
        if (seatPenetration > 0) finalPose.root.y -= seatPenetration;
        if (magnetism > 0 && seatPenetration < 0 && Math.abs(seatPenetration) < 100) {
            const pull = Math.abs(seatPenetration) * (magnetism * 0.5); 
            finalPose.root.y += pull;
        }
    }

    const newJoints = getJointPositions(finalPose);
    const contactPoints = [newJoints.lFootTip.y, newJoints.rFootTip.y, newJoints.lAnkle.y, newJoints.rAnkle.y];
    const lowestPointY = Math.max(...contactPoints);
    const penetration = lowestPointY - floorHeight;

    if (penetration > 0) finalPose.root.y -= penetration;
    if (!sitMode && magnetism > 0 && penetration < 0 && Math.abs(penetration) < 100) {
         const pull = Math.abs(penetration) * magnetism;
         finalPose.root.y += pull;
    }

    return finalPose;
};

export const clampPoseToBox = (pose: Pose, boxSize: number): Pose => {
    const margin = 50; 
    const limit = (boxSize / 2) - margin;
    return { ...pose, root: { x: Math.max(-limit, Math.min(limit, pose.root.x)), y: Math.max(-limit, Math.min(limit, pose.root.y)) } };
};

export const applyLimbLimpness = (pose: Pose): Pose => {
    const { rootRotation = 0, hips, torso } = pose;
    const limpPose = { ...pose };
    
    // Gravity Direction relative to Hips:
    // If GlobalHips = (Root + Hips), then Down (Global 0) requires Local = -GlobalHips
    const legGravity = -(rootRotation + hips);
    
    limpPose.rThigh = legCorrection(legGravity);
    limpPose.lThigh = legCorrection(legGravity);
    limpPose.rCalf = 0; 
    limpPose.lCalf = 0;
    limpPose.rAnkle = 0; 
    limpPose.lAnkle = 0;
    
    // Gravity relative to Torso:
    // R_Arm Global = (Root + Torso + 90) + R_Shoulder. Target 0 => R_S = -90 - (Root + Torso)
    limpPose.rShoulder = -90 - (rootRotation + torso);
    
    // L_Arm Global = (Root + Torso - 90) - L_Shoulder. Target 0 => L_S = (Root + Torso - 90)
    limpPose.lShoulder = (rootRotation + torso) - 90;
    
    limpPose.rForearm = 0; 
    limpPose.lForearm = 0;
    limpPose.rWrist = 0; 
    limpPose.lWrist = 0;
    
    return limpPose;
};

// Helper to keep legs from snapping wildly when 180 degrees
const legCorrection = (angle: number) => {
    // Normalize to -180 to 180
    let a = angle % 360;
    if (a > 180) a -= 360;
    if (a < -180) a += 360;
    return a;
}

export const solveTwoBoneIK = (
    rootRot: number,
    hipsRot: number,
    hipPos: {x: number, y: number},
    targetAnkle: {x: number, y: number},
    L1: number,
    L2: number,
    currentBendDir: number,
    tension: number = 100
) => {
    const dx = targetAnkle.x - hipPos.x;
    const dy = targetAnkle.y - hipPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxElasticity = 0.1; 
    const elasticityFactor = (100 - tension) / 100; 
    const allowedStretch = elasticityFactor * maxElasticity;
    const naturalReach = L1 + L2;
    const maxReach = naturalReach * (1 + Math.max(allowedStretch, 0.05)); 
    const clampedDist = Math.min(dist, maxReach);
    
    let stretch = 0;
    if (dist > naturalReach) {
        stretch = Math.max(0, clampedDist - naturalReach);
    }
    
    const reach = clampedDist;
    const cosAlpha = (L1*L1 + reach*reach - L2*L2) / (2 * L1 * reach);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
    
    const vectorAngle = Math.atan2(dy, dx) - (Math.PI / 2);
    const thighGlobalRad = vectorAngle - (alpha * currentBendDir);
    
    const cosC = (L1*L1 + L2*L2 - reach*reach) / (2 * L1 * L2);
    const angleC = Math.acos(Math.max(-1, Math.min(1, cosC)));
    const calfLocalRad = (Math.PI - angleC) * currentBendDir;
    
    const thighGlobalDeg = thighGlobalRad * 180 / Math.PI;
    const calfLocalDeg = calfLocalRad * 180 / Math.PI;
    const thighLocalDeg = thighGlobalDeg - rootRot - hipsRot;
    
    return {
        thigh: thighLocalDeg,
        calf: calfLocalDeg,
        stretch 
    };
};