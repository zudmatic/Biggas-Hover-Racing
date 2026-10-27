import * as T from 'three';

// Pose the original rig at runtime. No changes to skin weights or source GLB.
export function createDrivingPose(actor){
  const root=actor.root,mesh=root.getObjectByName('Bluleet');
  const bones=Object.fromEntries(mesh.skeleton.bones.map(b=>[b.name,b]));
  actor.setPose('tpose');root.updateMatrixWorld(true);
  const rest=new Map(mesh.skeleton.bones.map(b=>[b,b.quaternion.clone()]));
  const position=b=>b.getWorldPosition(new T.Vector3());
  const restFeet=Object.fromEntries(['l','r'].map(s=>[s,bones[`foot_${s}`].getWorldQuaternion(new T.Quaternion())]));
  const restHead=bones.Head.getWorldQuaternion(new T.Quaternion());
  const hands={},arms={};
  const frame=(direction,hinge)=>{
    const along=direction.clone().normalize(),axis=hinge.clone().addScaledVector(along,-hinge.dot(along)).normalize();
    return new T.Matrix4().makeBasis(along,axis,along.clone().cross(axis));
  };
  for(const [s,sign] of [['l',1],['r',-1]]){
    // The authored arm is already slightly bent. Its bend plane defines the
    // elbow hinge; retaining this frame avoids twisting the sleeve at the joint.
    const upper=bones[`upperarm_${s}`],lower=bones[`lowerarm_${s}`];
    const upperDirection=position(lower).sub(position(upper)),lowerDirection=position(bones[`hand_${s}`]).sub(position(lower));
    const hinge=upperDirection.clone().cross(lowerDirection).normalize();
    arms[s]=[upper,lower].map((bone,i)=>({inverse:frame(i?lowerDirection:upperDirection,hinge).invert(),rotation:bone.getWorldQuaternion(new T.Quaternion())}));
    const hand=bones[`hand_${s}`],wrist=position(hand),middle=position(bones[`middle_01_${s}`]);
    const forward=middle.clone().sub(wrist).normalize(),width=position(bones[`index_01_${s}`]).sub(position(bones[`pinky_01_${s}`]));
    width.addScaledVector(forward,-width.dot(forward)).normalize();
    const normal=forward.clone().cross(width).normalize(),palmNormal=normal.clone().multiplyScalar(sign);
    const bindFrame=new T.Matrix4().makeBasis(forward,width,normal);
    const contact=position(bones[`index_01_${s}`]).add(position(bones[`pinky_01_${s}`])).multiplyScalar(.5).lerp(wrist,.25).addScaledVector(palmNormal,middle.distanceTo(wrist)*.15);
    const hinges=new Map();
    for(const finger of ['index','middle','ring','pinky'])for(let i=1;i<=3;i++){
      const bone=bones[`${finger}_0${i}_${s}`],child=bones[i===3?`${finger}_04_leaf_${s}`:`${finger}_0${i+1}_${s}`];
      const axis=position(child).sub(position(bone)).normalize().cross(palmNormal).normalize();
      hinges.set(bone,axis.applyQuaternion(bone.getWorldQuaternion(new T.Quaternion()).invert()));
    }
    hands[s]={frame:bindFrame,rotation:hand.getWorldQuaternion(new T.Quaternion()),contact:hand.worldToLocal(contact),hinges};
  }
  function steeringHand(s,sign,grip){
    // Follow the tilted rim as the studio's hand-height controls change.
    // The palm faces inward and the thumb follows the tangent toward the top.
    const forward=new T.Vector3(0,-.5,.8660254);
    const angle=Math.atan2((grip.y-1.45)*.8660254+(grip.z-.67)*.5,Math.abs(grip.x));
    const width=new T.Vector3(-sign*Math.sin(angle),Math.cos(angle)*.8660254,Math.cos(angle)*.5);
    const radial=forward.clone().cross(width).normalize().multiplyScalar(-sign);
    const normal=forward.clone().cross(width).normalize();
    const h=hands[s],rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(forward,width,normal).multiply(h.frame.clone().invert())).multiply(h.rotation);
    // Leave room for the actual thickness of the mitten, not just its bones.
    const contact=grip.clone().addScaledVector(radial,.12).addScaledVector(forward,-.15);
    const offset=h.contact.clone().multiply(bones[`hand_${s}`].getWorldScale(new T.Vector3())).applyQuaternion(rotation);
    return {rotation,contact,wrist:contact.clone().sub(offset),forward,width,radial};
  }
  function aim(bone,child,target){
    root.updateMatrixWorld(true);
    const from=position(child).sub(position(bone)).normalize(),to=target.clone().sub(position(bone)).normalize();
    const world=new T.Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new T.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
    root.updateMatrixWorld(true);
  }
  function limb(a,b,c,target,pole,frames=null){
    const origin=position(a),l1=origin.distanceTo(position(b)),l2=position(b).distanceTo(position(c));
    const dir=target.clone().sub(origin),distance=T.MathUtils.clamp(dir.length(),Math.abs(l1-l2)+.001,l1+l2-.001);dir.normalize();
    const bend=pole.clone().sub(origin);bend.addScaledVector(dir,-bend.dot(dir)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const joint=origin.clone().addScaledVector(dir,along).addScaledVector(bend,height),end=origin.clone().addScaledVector(dir,distance);
    if(frames){
      const upper=joint.clone().sub(origin),lower=end.clone().sub(joint),hinge=upper.clone().cross(lower).normalize();
      for(const [i,bone,direction] of [[0,a,upper],[1,b,lower]]){
        const world=new T.Quaternion().setFromRotationMatrix(frame(direction,hinge).multiply(frames[i].inverse)).multiply(frames[i].rotation);
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
        root.updateMatrixWorld(true);
      }
    }else{
      aim(a,b,joint);
      aim(b,c,end);
    }
    return position(c).distanceTo(target);
  }
  return function pose({height=2.8,seatY=1.225,seatZ=-.1,gripX=.375,gripY=1.35,gripZ=.625,footX=.29,lean=7*Math.PI/180,steering=true}={}){
    actor.set({height,gaze:false});root.position.set(0,0,0);root.rotation.set(0,0,0);
    for(const [b,q] of rest)b.quaternion.copy(q);
    root.updateMatrixWorld(true);
    root.position.add(new T.Vector3(0,seatY,seatZ).sub(position(bones.pelvis)));root.updateMatrixWorld(true);
    // Sit back in the bucket seat with only a slight forward lean.
    const spine=bones.spine_01,world=spine.getWorldQuaternion(new T.Quaternion());
    world.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),lean));
    spine.quaternion.copy(spine.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));root.updateMatrixWorld(true);
    bones.Head.quaternion.copy(bones.Head.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(restHead));root.updateMatrixWorld(true);
    const errors=[],contacts=[];
    for(const [s,sign] of [['l',1],['r',-1]]){
      limb(bones[`thigh_${s}`],bones[`calf_${s}`],bones[`foot_${s}`],new T.Vector3(sign*footX,.46,.66),new T.Vector3(sign*Math.max(.36,footX),.98,.9));
      const foot=bones[`foot_${s}`];foot.quaternion.copy(foot.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(restFeet[s]));
      root.updateMatrixWorld(true);
      if(steering){
        // Let the shoulders reach forward independently of the torso, keeping
        // the head over the seat and preserving the authored arm lengths.
        const shoulder=bones[`clavicle_${s}`],rotation=shoulder.getWorldQuaternion(new T.Quaternion());
        rotation.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-sign*.9));
        shoulder.quaternion.copy(shoulder.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));
        root.updateMatrixWorld(true);
      }
      const grip=new T.Vector3(sign*gripX,gripY,gripZ),hold=steering?steeringHand(s,sign,grip):null,hand=bones[`hand_${s}`];
      limb(bones[`upperarm_${s}`],bones[`lowerarm_${s}`],hand,hold?.wrist??grip,new T.Vector3(sign*.34,1.12,.1),arms[s]);
      if(hold){hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(hold.rotation));root.updateMatrixWorld(true);}
      for(const f of ['index','middle','ring','pinky'])for(const [i,angle] of [[1,25],[2,65],[3,40]]){
        const b=bones[`${f}_0${i}_${s}`];if(b)b.quaternion.multiply(new T.Quaternion().setFromAxisAngle(hands[s].hinges.get(b),angle*Math.PI/180));
      }
      root.updateMatrixWorld(true);
      if(hold){
        // Oppose the thumb against the inside of the rim instead of leaving it
        // spread in the bind pose. Preserve both phalanx lengths.
        const tip=grip.clone().addScaledVector(hold.width,.05).addScaledVector(hold.radial,-.07).addScaledVector(hold.forward,-.06);
        const pole=grip.clone().addScaledVector(hold.radial,-.09).addScaledVector(hold.forward,-.16);
        limb(bones[`thumb_02_${s}`],bones[`thumb_03_${s}`],bones[`thumb_04_leaf_${s}`],tip,pole);
      }
      const palm=hand.localToWorld(hands[s].contact.clone());errors.push(hold?palm.distanceTo(hold.contact):position(hand).distanceTo(grip));contacts.push({palm:palm.toArray(),target:(hold?.contact??grip).toArray()});
    }
    root.updateMatrixWorld(true);return {handErrors:errors,contacts,pelvis:position(bones.pelvis).toArray()};
  };
}
