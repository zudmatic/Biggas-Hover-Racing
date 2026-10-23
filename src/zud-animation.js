import * as THREE from 'three';
import { smokeCycle } from './accessories.js';
import { createActionForgePlayer, DANCE_LOOP_DURATION } from './actionforge-animation.js';

// Connected shoulder/hip pivots stay anchored while the rig bends the shells
// at the elbows and knees. Props follow articulated hand sockets.
export function createZudAnimator(model) {
  const {root,arms,feet,rig,laptop}=model;
  root.rotation.order='YXZ'; // Lean and nod in the direction Zud faces.
  let desk=0,wasJumping=false,landing=0,jumpTime=0;
  const clips=createActionForgePlayer();
  const handPoint=new THREE.Vector3();
  const ease=(a,b,dt)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-dt*12));
  return {reset() {
    desk=0;wasJumping=false;landing=0;jumpTime=0;root.position.set(0,1.34,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);
    model.eyeController.pose(1,0,true);
    for(const joint of [...arms,...feet]){joint.position.copy(joint.userData.restPosition);joint.rotation.set(0,0,0);}
    rig.reset();
  },update({state='idle',time=0,elapsed=0,dt=1/60,motion=1,traveling=false,
    typingAtDesk=false,workPose=false,wearing=false,halloweenElapsed=0,
    gait={weight:0,phase:0},jumping=false,musicTime=0,musicPlaying=false,
    blink=false,yaw=0,pitch=0,accessories,deskReach=1.5,lying=0,seated=typingAtDesk?1:0,workArmPitch=-2.02,workLean=0,sitLegPitch=-1.16,reach=0}) {
    dt=Math.max(0,Number.isFinite(dt)?dt:0);
    const action=traveling?'idle':state;
    const armX=[0,0],armY=[0,0],armZ=[-.1,.1],legX=[0,0],legZ=[0,0];
    const elbow=[.08,.08],knee=[0,0];
    let y=1.34,rx=0,rz=0,turn=0,eyeScale=1;
    const wave=Math.sin(time*2)*motion;
    y+=wave*.012;rz=Math.sin(time*1.3)*.012*motion;
    const applyClip=(name,phase,weight=motion)=>{
      const pose={armX,armY,armZ,legX,legZ,elbow,knee,rx,rz,turn};
      clips.apply(pose,name,phase,weight);({rx,rz,turn}=pose);
    };
    if(action==='idle'||action==='walk')applyClip('idle',time/2.5);
    if(action==='wave') {
      armX[1]=-.40;armZ[1]=1.25+Math.sin(elapsed*7)*.12*motion;
      elbow[1]=.48+Math.sin(elapsed*10+.5)*.28*motion;
      rz=-.035;turn=Math.sin(elapsed*3)*.04*motion;
    } else if(action==='jump') {
      const phase=((elapsed*1.25)%1+1)%1;
      const air=THREE.MathUtils.clamp((phase-.16)/.62,0,1);
      const crouch=phase<.16?Math.sin(phase/.16*Math.PI):phase>.78?Math.sin((phase-.78)/.22*Math.PI):0;
      const lift=Math.sin(air*Math.PI);
      y+=(lift*.85-crouch*.075)*motion;rx=crouch*.10*motion;
      armZ[0]=-.20-lift*.65*motion;armZ[1]=-armZ[0];
      armX[0]=armX[1]=-lift*.25*motion;
      elbow[0]=elbow[1]=.15+lift*.35*motion;
      legX[0]=legX[1]=-(crouch*.35+lift*.18)*motion;
      knee[0]=knee[1]=(crouch*.72+lift*.4)*motion;
      const clipWeight=motion*THREE.MathUtils.smoothstep(phase,0,.06)*(1-THREE.MathUtils.smoothstep(phase,.94,1));
      if(phase<.16)applyClip('takeoff',phase/.16,clipWeight);
      else if(phase<.78)applyClip('air',(phase-.16)/.62,clipWeight);
      else applyClip('land',(phase-.78)/.22,clipWeight);
    } else if(action==='dance'||action==='disco') {
      const dancing=action==='dance'||(musicPlaying&&!wearing);
      applyClip('dance',(action==='disco'?musicTime:elapsed)/DANCE_LOOP_DURATION,dancing?motion:0);
      // The captured pose and sole support determine body height. Adding an
      // independent sine bounce changes the choreography of Dance Loop.
      y=1.34;
    } else if(action==='sleep') {
      rx=.07;rz=-.09;eyeScale=.10;y=1.34+wave*.008;
      armZ[0]=-.04;armZ[1]=.04;
    } else if(action==='smoke') {
      // Eyes closed the whole time. The hand rests at the belly, rises for a
      // drag (chest lifts), comes back down, and he exhales with his head up.
      const cycle=smokeCycle(motion?elapsed:0);
      eyeScale=.07;rz=-.025+cycle.breath*.012*motion;turn=-cycle.exhale*.045*motion;
      // At the top of the reach the hand brings the filter to the lower cheek.
      armX[0]=THREE.MathUtils.lerp(-.45,-1.125,cycle.reach);
      armY[0]=-.20*cycle.reach;armZ[0]=THREE.MathUtils.lerp(.12,1.05,cycle.reach);
      elbow[0]=THREE.MathUtils.lerp(.18,.85,cycle.reach);
      armX[1]=-.08;armZ[1]=.08;elbow[1]=.12;
      // A quiet shift onto the supporting leg while he lets the breath go.
      legX[1]=-.04*cycle.exhale*motion;
      y=1.34+cycle.breath*.022*motion;rx=-(cycle.breath*.025+cycle.exhale*.045)*motion;
    } else if(action==='water') {
      // Left arm (the side the room camera sees) holds the can out over the
      // pot; a slow, content pour.
      armX[0]=-1.5;armZ[0]=.64;armX[1]=-.25;armZ[1]=.18;
      elbow[0]=.28;elbow[1]=.15;
      rx=.07;eyeScale=.55;y+=Math.sin(time*2)*.01*motion;turn=Math.sin(time*1.1)*.04*motion;
    } else if(action==='halloween') {
      const hop=motion*Math.sin(Math.PI*THREE.MathUtils.clamp((halloweenElapsed-1)/.55,0,1));
      y+=hop*.25;armZ[0]=-.55-hop*.5;armZ[1]=.55+hop*.5;
      armX[0]=armX[1]=-.3;rz=-.03;
    }
    if(workPose) {
      const ready=typingAtDesk?1:THREE.MathUtils.smoothstep(seated,.55,1);
      armX[0]=THREE.MathUtils.lerp(-.3,workArmPitch,ready)+Math.sin(time*16)*.055*motion*Number(typingAtDesk);
      armX[1]=THREE.MathUtils.lerp(-.3,workArmPitch,ready)+Math.cos(time*16)*.055*motion*Number(typingAtDesk);
      armZ[0]=THREE.MathUtils.lerp(-.1,.18,ready);armZ[1]=-armZ[0];
      for(let i=0;i<2;i++){
        elbow[i]=.08+ready*.12+Math.sin(time*16+i*Math.PI)*.045*motion*Number(typingAtDesk);
        armX[i]+=elbow[i]*.45;
      }
    }
    if(reach){armX[0]=THREE.MathUtils.lerp(armX[0],-1.05,reach);armZ[0]=THREE.MathUtils.lerp(armZ[0],.22,reach);rx=.06*reach;}
    if(seated) {
      y=THREE.MathUtils.lerp(y,1.28,seated);
      rx=workLean*seated;
      // Lift the thighs as the knees fold so the calves clear the cushion.
      legX[0]=legX[1]=(sitLegPitch-.35)*seated;legZ[0]=.06*seated;legZ[1]=-.06*seated;
      knee[0]=knee[1]=.70*seated;
      rz=0;
    }
    if(wearing) {
      // Short arms lift accessories from chest height in front of the face.
      armX[0]=armX[1]=-1.75;
      armZ[0]=-.18;armZ[1]=.18;
      elbow[0]=elbow[1]=.3;
    }
    // Phase comes from distance, so both arrow controls and automatic routes
    // drive the imported walk without importing its horizontal root motion.
    const walking=motion*gait.weight;
    if(walking&&!jumping)applyClip('walk',gait.phase/(Math.PI*2),walking);
    if(wasJumping&&!jumping)landing=1;
    jumpTime=jumping?(wasJumping?jumpTime+dt:0):0;
    wasJumping=jumping;landing*=Math.exp(-dt*14);
    if(jumping){
      if(jumpTime<.12)applyClip('takeoff',jumpTime/.12);
      else applyClip('air',(jumpTime-.12)/2.5);
    }else if(!seated&&!lying&&motion&&landing>.001){
      applyClip('land',1-landing,landing*motion);
      y-=landing*.065;
    }
    if(lying) {
      // On his back in bed: face up, arms loose at his sides, legs straight,
      // eyes closed and a slow breath.
      // Lie along the mattress, with the pillow compressing under the head
      // and the duvet settling around the body.
      rx=-(Math.PI/2-.10)*lying;rz=0;turn=0;y=THREE.MathUtils.lerp(y,1.10,lying);
      armX[0]*=1-lying;armX[1]*=1-lying;armZ[0]=THREE.MathUtils.lerp(armZ[0],-.24,lying);armZ[1]=THREE.MathUtils.lerp(armZ[1],.24,lying);
      legX[0]=THREE.MathUtils.lerp(legX[0],.35,lying);legX[1]=THREE.MathUtils.lerp(legX[1],.35,lying);legZ[0]=THREE.MathUtils.lerp(legZ[0],-.05,lying);legZ[1]=-legZ[0];
      for(let i=0;i<2;i++){elbow[i]*=1-lying;knee[i]*=1-lying;}
      eyeScale=.07;y+=Math.sin(time*1.4)*.012*motion*lying;
    }
    desk=ease(desk,typingAtDesk?1:0,dt);
    // Roll the chair under the desk, moving the whole connected character.
    root.position.x=desk*deskReach*Math.sin(yaw);
    root.position.z=desk*deskReach*Math.cos(yaw);
    root.position.y=ease(root.position.y,y,dt);
    root.scale.set(1,1,1);
    const targetYaw=yaw+turn;
    const yawDelta=Math.atan2(Math.sin(targetYaw-root.rotation.y),Math.cos(targetYaw-root.rotation.y));
    root.rotation.set(ease(root.rotation.x,pitch+rx,dt),root.rotation.y+ease(0,yawDelta,dt),ease(root.rotation.z,rz,dt));
    const sleeping=Boolean(lying)||action==='sleep';
    for(let i=0;i<2;i++) {
      arms[i].visible=true;
      arms[i].position.copy(arms[i].userData.restPosition);
      feet[i].position.copy(feet[i].userData.restPosition);
      arms[i].rotation.set(ease(arms[i].rotation.x,armX[i],dt),ease(arms[i].rotation.y,armY[i],dt),ease(arms[i].rotation.z,armZ[i],dt));
      feet[i].rotation.set(ease(feet[i].rotation.x,legX[i],dt),0,ease(feet[i].rotation.z,legZ[i],dt));
      // Elbows flex forward (-X), knees backward (+X), within joint limits.
      rig.elbows[i].rotation.x=ease(rig.elbows[i].rotation.x,-THREE.MathUtils.clamp(elbow[i],0,1.45),dt);
      rig.knees[i].rotation.x=ease(rig.knees[i].rotation.x,THREE.MathUtils.clamp(knee[i],0,1.25),dt);
    }
    rig.update();
    if(!seated&&!lying) {
      const floor=rig.floorHeight(root);
      // Keep the stance sole on the floor during locomotion; elsewhere only
      // correct penetration, preserving the intentional lift of a jump.
      const dancing=action==='dance'||(action==='disco'&&musicPlaying&&!wearing);
      root.position.y-=floor<0?floor:floor*THREE.MathUtils.clamp(jumping?0:dancing?motion:walking,0,1);
    }
    model.eyeController.pose(sleeping||blink?0:eyeScale,dt);
    // Laptop and props are sized and positioned for Zud's reach.
    laptop.scale.setScalar(.78);laptop.position.set(0,-.29,-.03);
    if(accessories) {
      accessories.glasses.scale.setScalar(.88);
      if(wearing&&action==='disco') {
        const wear=THREE.MathUtils.smoothstep(elapsed,0,.85);
        accessories.glasses.position.set(0,THREE.MathUtils.lerp(-.35,-.08,wear),THREE.MathUtils.lerp(.97,.84,wear));
      }
      if(action==='smoke') {
        // Cigarette and smoke follow the attached hand instead of a remote
        // Ruchi hand target.
        root.updateMatrixWorld(true);
        const tip=rig.hands[0].getWorldPosition(handPoint);
        model.accessoryMount.worldToLocal(tip);
        accessories.smoking.position.set(tip.x+.19,tip.y+.42,tip.z-.80);
      } else accessories.smoking.position.set(0,0,0);
      if(action==='water') {
        // The can hangs from the left hand, tipping to pour.
        root.updateMatrixWorld(true);
        const hand=rig.hands[0].getWorldPosition(handPoint);
        model.accessoryMount.worldToLocal(hand);
        accessories.can.position.copy(hand);
        accessories.can.rotation.set(.38+Math.sin(time*2.2)*.08*motion,0,0);
      }
    }
    return {desk};
  }};
}
