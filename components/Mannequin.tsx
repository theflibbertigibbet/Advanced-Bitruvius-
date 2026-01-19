import React from 'react';
import { Bone } from './Bone';
import { Pose } from '../types';
import { ANATOMY, RIGGING } from '../constants';

type FocusMode = 'all' | 'core' | 'upper' | 'lower';

interface MannequinProps {
  pose: Pose;
  showOverlay?: boolean;
  visibility?: Record<string, boolean>;
  focusMode?: FocusMode;
  wormMode?: boolean;
  hoveredPart?: string | null;
  selectedPart?: string | null;
  pinnedJoints?: Map<string, {x: number, y: number}>;
}

export const Mannequin: React.FC<MannequinProps> = ({ 
    pose, 
    showOverlay = true, 
    visibility = {}, 
    focusMode = 'all',
    wormMode = false,
    hoveredPart,
    selectedPart,
    pinnedJoints
}) => {
  // --- RIGGING CONSTANTS ---
  const shoulderInset = RIGGING.SHOULDER_INSET; 
  const shoulderLift = RIGGING.SHOULDER_LIFT;
  const clavicleExtension = RIGGING.CLAVICLE_EXTENSION;
  const neckSink = RIGGING.NECK_SINK;
  const offsets = pose.offsets || {};
  const shoulderSize = ANATOMY.LIMB_WIDTH_ARM; 
  
  // --- UPPER BODY COORDINATES ---
  const navelY_Torso = -ANATOMY.TORSO;
  const rShoulderX = -(ANATOMY.SHOULDER_WIDTH/2 - shoulderInset + clavicleExtension);
  const lShoulderX = (ANATOMY.SHOULDER_WIDTH/2 - shoulderInset + clavicleExtension);
  const shoulderY = shoulderLift;
  
  const rOff = offsets.rShoulder || {x: 0, y: 0};
  const lOff = offsets.lShoulder || {x: 0, y: 0};
  const rShoulderX_Adj = rShoulderX + rOff.x;
  const rShoulderY_Adj = shoulderY + rOff.y;
  const lShoulderX_Adj = lShoulderX + lOff.x;
  const lShoulderY_Adj = shoulderY + lOff.y;
  
  // --- LOWER BODY COORDINATES ---
  // The Pelvis Bone component shifts its children to (0, length).
  // So '0' in the child coordinate space is the BOTTOM of the pelvis (the hip line).
  // We attach the legs at Y=0 to connect them solid to the hips.
  const navelY_Pelvis = -ANATOMY.PELVIS; // Relative to the bottom of the bone, Navel is at -Length.
  const rHipX = ANATOMY.HIP_WIDTH/4;
  const lHipX = -ANATOMY.HIP_WIDTH/4;
  const hipY = 0; // Attach directly to the bottom of the Pelvis bone

  // --- MASKING LOGIC ---
  const getStyle = (group: 'core' | 'upper' | 'lower' | 'l_arm' | 'r_arm' | 'l_leg' | 'r_leg') => {
      if (wormMode) {
          if (group === 'l_arm' || group === 'r_arm' || group === 'l_leg') return { display: 'none' };
          return { opacity: 1 };
      }
      let opacity = 1;
      let pointerEvents: 'auto' | 'none' = 'auto';
      if (focusMode === 'core' && group !== 'core') { opacity = 0.1; pointerEvents = 'none'; }
      else if (focusMode === 'upper' && !['upper', 'l_arm', 'r_arm', 'core'].includes(group)) { opacity = 0.1; pointerEvents = 'none'; }
      else if (focusMode === 'lower' && !['lower', 'l_leg', 'r_leg', 'core'].includes(group)) { opacity = 0.1; pointerEvents = 'none'; }
      return { opacity, pointerEvents };
  };

  const isVisible = (key: string) => visibility[key] !== false;

  // --- OVERLAY HELPERS ---
  const renderTargetIndicator = (partName: string, radius: number = 10) => {
      if (!showOverlay) return null;
      const isHovered = hoveredPart === partName;
      const isSelected = selectedPart === partName;
      const isPinned = pinnedJoints?.has(partName);
      if (!isHovered && !isSelected && !isPinned) return null;

      const color = isPinned ? '#3b82f6' : (isSelected ? '#3b82f6' : (isHovered ? '#06b6d4' : 'transparent'));
      const isDashed = isSelected && !isPinned; 
      
      return (
          <g className="pointer-events-none">
             <circle r={radius + 4} fill={isPinned ? color : "none"} stroke={color} strokeWidth="2" strokeDasharray={isDashed ? "2 2" : "none"} opacity={isPinned ? "1" : "0.8"}>
                {isSelected && !isPinned && <animate attributeName="r" values={`${radius+4};${radius+8};${radius+4}`} dur="1.5s" repeatCount="indefinite" />}
             </circle>
             {isPinned && <circle r={4} fill="white" />}
          </g>
      );
  }

  const renderRangeArc = (partName: string, chainLength: number) => {
      if (selectedPart !== partName || !showOverlay) return null;
      return <circle r={chainLength} fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="4 4" opacity="0.2" className="pointer-events-none" />;
  };

  return (
    <g 
      className="mannequin-root text-ink"
      transform={`translate(${pose.root.x}, ${pose.root.y}) rotate(${pose.rootRotation || 0})`}
    >
      {/* ================= UPPER BODY ================= */}
      <g style={getStyle('core')}>
          <Bone 
            rotation={pose.torso} length={ANATOMY.TORSO} width={ANATOMY.SHOULDER_WIDTH} 
            variant="wedge" rounded={true} cutout={12} 
            showOverlay={showOverlay} visible={isVisible('torso')} offset={offsets.torso}
            decorations={[{ position: 0.65, shape: 'square', type: 'filled', size: 8 }, { position: 0.85, shape: 'circle', type: 'filled', size: 10 }]}
          >
            {showOverlay && isVisible('torso') && (
                <>
                    <line x1={0} y1={navelY_Torso} x2={rShoulderX_Adj} y2={rShoulderY_Adj} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                    <line x1={0} y1={navelY_Torso} x2={lShoulderX_Adj} y2={lShoulderY_Adj} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                    <line x1={rShoulderX_Adj} y1={rShoulderY_Adj} x2={0} y2={neckSink} stroke="#a855f7" strokeWidth={1.5} opacity={0.75} strokeLinecap="round" />
                    <line x1={lShoulderX_Adj} y1={lShoulderY_Adj} x2={0} y2={neckSink} stroke="#a855f7" strokeWidth={1.5} opacity={0.75} strokeLinecap="round" />
                </>
            )}

            {/* NECK */}
            <g transform={`translate(0, ${neckSink})`}>
              <Bone rotation={pose.neck} length={ANATOMY.NECK} width={ANATOMY.NECK_BASE} variant="column" showOverlay={showOverlay} visible={isVisible('neck')} offset={offsets.neck}>
                   {isVisible('neck') && (
                       <g transform={`translate(0, ${0})`}> 
                          <circle cx="0" cy={ANATOMY.HEAD/2} r={ANATOMY.HEAD / 2} fill="currentColor" />
                          {renderTargetIndicator('head', ANATOMY.HEAD/2)}
                          {showOverlay && (<><line x1={0} y1={-ANATOMY.NECK} x2={0} y2={ANATOMY.HEAD/2} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" /><circle cx="0" cy={ANATOMY.HEAD/2} r={3} fill="#a855f7" /></>)}
                       </g>
                   )}
              </Bone>
            </g>

            {/* RIGHT ARM */}
            <g transform={`translate(${rShoulderX}, ${shoulderY})`} style={getStyle('r_arm')}> 
              {renderRangeArc('rHand', ANATOMY.UPPER_ARM + ANATOMY.LOWER_ARM + ANATOMY.HAND)}
              <Bone rotation={90 + pose.rShoulder} corrective={pose.rBicepCorrective} length={ANATOMY.UPPER_ARM} width={ANATOMY.LIMB_WIDTH_ARM} variant="taper" showOverlay={showOverlay} visible={isVisible('rShoulder')} offset={offsets.rShoulder} decorations={[{ position: 0, shape: 'circle', type: 'filled', size: shoulderSize }]}>
                <Bone rotation={pose.rForearm} length={ANATOMY.LOWER_ARM} width={ANATOMY.LIMB_WIDTH_FOREARM} variant="diamond" showOverlay={showOverlay} visible={isVisible('rForearm')} offset={offsets.rForearm}>
                  <Bone rotation={pose.rWrist} length={ANATOMY.HAND} width={ANATOMY.EFFECTOR_WIDTH} variant="arrowhead" showOverlay={showOverlay} visible={isVisible('rWrist')} offset={offsets.rWrist}>
                     <g transform={`translate(0, ${ANATOMY.HAND})`}>{renderTargetIndicator('rHand')}</g>
                   </Bone>
                </Bone>
              </Bone>
            </g>

            {/* LEFT ARM */}
            <g transform={`translate(${lShoulderX}, ${shoulderY})`} style={getStyle('l_arm')}>
              {renderRangeArc('lHand', ANATOMY.UPPER_ARM + ANATOMY.LOWER_ARM + ANATOMY.HAND)}
              <Bone rotation={-(90 + pose.lShoulder)} corrective={pose.lBicepCorrective} length={ANATOMY.UPPER_ARM} width={ANATOMY.LIMB_WIDTH_ARM} variant="taper" showOverlay={showOverlay} visible={isVisible('lShoulder')} offset={offsets.lShoulder} decorations={[{ position: 0, shape: 'circle', type: 'filled', size: shoulderSize }]}>
                 <Bone rotation={pose.lForearm} length={ANATOMY.LOWER_ARM} width={ANATOMY.LIMB_WIDTH_FOREARM} variant="diamond" showOverlay={showOverlay} visible={isVisible('lForearm')} offset={offsets.lForearm}>
                    <Bone rotation={pose.lWrist} length={ANATOMY.HAND} width={ANATOMY.EFFECTOR_WIDTH} variant="arrowhead" showOverlay={showOverlay} visible={isVisible('lWrist')} offset={offsets.lWrist}>
                        <g transform={`translate(0, ${ANATOMY.HAND})`}>{renderTargetIndicator('lHand')}</g>
                    </Bone>
                 </Bone>
              </Bone>
            </g>
          </Bone>
      </g>

      {/* ================= LOWER BODY ================= */}
      <g style={getStyle('core')}>
          <Bone 
            rotation={pose.hips} length={ANATOMY.PELVIS} width={ANATOMY.HIP_WIDTH * 0.65} 
            variant="pelvis" rounded={true} showOverlay={showOverlay} visible={isVisible('hips')} offset={offsets.hips}
          >
            {showOverlay && isVisible('hips') && (
                <>
                    {/* Lines start at Navel (0, -L) and go to Hips (X, 0) */}
                    <line x1={0} y1={navelY_Pelvis} x2={rHipX} y2={hipY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                    <line x1={0} y1={navelY_Pelvis} x2={lHipX} y2={hipY} stroke="#a855f7" strokeWidth={2} opacity={0.9} strokeLinecap="round" />
                </>
            )}

            {/* RIGHT LEG */}
            <g transform={`translate(${rHipX}, ${hipY})`} style={getStyle('r_leg')}>
              {renderRangeArc('rFoot', ANATOMY.LEG_UPPER + ANATOMY.LEG_LOWER + ANATOMY.FOOT)}
              <Bone rotation={pose.rThigh} corrective={pose.rThighCorrective} length={ANATOMY.LEG_UPPER} width={ANATOMY.LIMB_WIDTH_THIGH} variant="diamond" showOverlay={showOverlay} visible={isVisible('rThigh')} offset={offsets.rThigh}>
                   <Bone rotation={pose.rCalf} length={ANATOMY.LEG_LOWER} width={ANATOMY.LIMB_WIDTH_CALF} variant="diamond" showOverlay={showOverlay} visible={isVisible('rCalf')} offset={offsets.rCalf}>
                        <Bone rotation={-90 + pose.rAnkle} length={ANATOMY.FOOT} width={ANATOMY.EFFECTOR_WIDTH} variant="arrowhead" showOverlay={showOverlay} visible={isVisible('rAnkle')} offset={offsets.rAnkle}>
                            <g transform={`translate(0, ${ANATOMY.FOOT})`}>{renderTargetIndicator('rFoot')}</g>
                        </Bone>
                   </Bone>
              </Bone>
            </g>

             {/* LEFT LEG */}
             <g transform={`translate(${lHipX}, ${hipY})`} style={getStyle('l_leg')}>
              {renderRangeArc('lFoot', ANATOMY.LEG_UPPER + ANATOMY.LEG_LOWER + ANATOMY.FOOT)}
              <Bone rotation={pose.lThigh} corrective={pose.lThighCorrective} length={ANATOMY.LEG_UPPER} width={ANATOMY.LIMB_WIDTH_THIGH} variant="diamond" showOverlay={showOverlay} visible={isVisible('lThigh')} offset={offsets.lThigh}>
                   <Bone rotation={pose.lCalf} length={ANATOMY.LEG_LOWER} width={ANATOMY.LIMB_WIDTH_CALF} variant="diamond" showOverlay={showOverlay} visible={isVisible('lThigh')} offset={offsets.lThigh}>
                        <Bone rotation={90 + pose.lAnkle} length={ANATOMY.FOOT} width={ANATOMY.EFFECTOR_WIDTH} variant="arrowhead" showOverlay={showOverlay} visible={isVisible('lAnkle')} offset={offsets.lAnkle}>
                            <g transform={`translate(0, ${ANATOMY.FOOT})`}>{renderTargetIndicator('lFoot')}</g>
                        </Bone>
                   </Bone>
              </Bone>
            </g>
          </Bone>
      </g>
    </g>
  );
};