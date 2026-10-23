import * as THREE from 'three';
import { layout } from './home-layout.js';
import { canStand, findWalkPath } from './home-movement.js';

// A cancellable route through the open aisle. All commands replace the route,
// so switching actions or scenes never leaves a delayed 'sit' callback behind.
export class HomeJourney {
  constructor() { this.reset(); }
  reset() {
    this.position=layout.home.clone(); this.heading=layout.idleHeading;
    this.phase='idle'; this.intent='home'; this.visit=null; this.exit=null; this.segments=[]; this.segment=null;
  }
  // intent: 'home', 'desk', 'visit' (walk up to an object: {position, heading})
  // or 'bed' (walk to the bed's side, climb in and lie down: layout.bed).
  go(intent, instant=false, visit=null) {
    const sameVisit=intent==='visit'&&this.intent==='visit'&&this.visit&&visit&&this.visit.position.equals(visit.position);
    const settled={desk:'typing',bed:'resting'}[intent]??'idle';
    if ((intent!=='visit'||sameVisit) && this.intent===intent && (this.segment || this.phase===settled)) return;
    if(intent==='visit'&&(!visit||!canStand(visit.position.x,visit.position.z)))return false;
    const fromPose=this.pose,opening=this.bedOpening;
    const previous={intent:this.intent,visit:this.visit,exit:this.exit,segments:this.segments,segment:this.segment};
    const fromDesk=this.intent==='desk';
    // The way off whatever he's on (bed or chair) is only valid for this move.
    const leave=this.exit;this.exit=null;
    this.intent=intent; this.visit=intent==='visit'?visit:null; this.segments=[]; this.segment=null;
    if(instant) {
      this.position.copy(intent==='desk'?layout.seated:intent==='bed'?layout.bed.lie:intent==='visit'?visit.position:layout.home);
      this.heading=intent==='desk'?layout.sitHeading:intent==='bed'?(layout.bed.heading??0):intent==='visit'?visit.heading:layout.idleHeading;
      this.exit=intent==='bed'?layout.bed.side:null;
      this.phase=settled; return;
    }
    const add=(point,phase,duration,heading) => this.segments.push({to:point.clone(),phase,duration,heading});
    let blocked=false;
    const route=(from,to,phase)=>{
      const path=findWalkPath(from,to);
      if(!path.length){blocked=true;return;}
      path.forEach(point=>add(point,phase));
    };
    let origin=this.position;
    if(this.position.y>layout.home.y+.04) {
      // Get off where he got on: the bed's side, or beside the chair (rooms with
      // a side approach); others drop straight down.
      const exit=leave??layout.stand??new THREE.Vector3(this.position.x,layout.home.y,this.position.z);
      if(leave&&layout.bed.blanket&&opening<1){
        add(this.position,'uncovering',.55,this.heading);
        Object.assign(this.segments.at(-1),{fromPose,blanket:[opening,1]});
      }
      add(exit,'standing',1.2,leave?layout.bed.sideHeading:layout.sitHeading);
      this.segments.at(-1).fromPose={...fromPose,bed:Boolean(leave)};
      if(leave&&layout.bed.blanket){
        this.segments.at(-1).blanket=[1,1];
        add(exit,'covering',.55,layout.bed.sideHeading);
        Object.assign(this.segments.at(-1),{fromPose:{seated:0,lying:0,reach:0},blanket:[1,0]});
      }
      origin=exit;
    }else if(opening>0){
      // A cancelled approach can leave the blanket partly folded, too.
      add(origin,'covering',.45,this.heading);
      Object.assign(this.segments.at(-1),{fromPose,blanket:[opening,0]});
    }
    if(intent==='desk') {
      const aisle=layout.aisle;
      route(origin,aisle,'walking');
      route(aisle,layout.chair,'walking');
      add(layout.chair,'aligning',.28,layout.sitHeading);
      add(layout.seated,'sitting',1.25,layout.sitHeading);
    } else if(intent==='bed') {
      let from=origin;
      if(fromDesk){route(origin,layout.aisle,'walking');from=layout.aisle;}
      route(from,layout.bed.side,'walking');
      // Climb in: hop up and turn to lie along the bed, head on the pillow.
      add(layout.bed.side,'aligning',layout.bed.blanket ? .55 : .28,layout.bed.heading??0);
      if(layout.bed.blanket)this.segments.at(-1).blanket=[0,1];
      add(layout.bed.lie,'lying',1.5,layout.bed.heading??0);
      if(layout.bed.blanket){
        this.segments.at(-1).blanket=[1,1];
        add(layout.bed.lie,'covering',.85,layout.bed.heading??0);
        Object.assign(this.segments.at(-1),{fromPose:{seated:0,lying:1,reach:0},blanket:[1,0]});
      }
      this.exit=layout.bed.side;
    } else if(intent==='visit') {
      // Leave the desk by the aisle, then find a clear way to the object.
      let from=origin;
      if(fromDesk){route(origin,layout.aisle,'walking');from=layout.aisle;}
      route(from,visit.position,'walking');
      add(visit.position,'reaching',.55,visit.heading);
    } else {
      route(origin,layout.home,'returning');
    }
    // Never substitute a straight line through furniture for a failed route.
    if(blocked){Object.assign(this,previous);return false;}
    this.next();
    return true;
  }
  get pose() {
    if(['uncovering','covering'].includes(this.phase))return {...this.segment.fromPose};
    const progress=this.segment?Math.min(1,this.segment.elapsed/this.segment.duration):1;
    let seated=0,lying=0,reach=0;
    if(this.phase==='typing')seated=1;
    if(this.phase==='sitting')seated=THREE.MathUtils.smoothstep(progress,.05,.65);
    if(this.phase==='lying'){
      lying=THREE.MathUtils.smoothstep(progress,.40,.78);
      seated=THREE.MathUtils.smoothstep(progress,.1,.4)*(1-lying);
    }
    if(this.phase==='resting')lying=1;
    if(this.phase==='standing'){
      seated=(this.segment.fromPose?.seated??0)*(1-THREE.MathUtils.smoothstep(progress,.15,.7));
      lying=(this.segment.fromPose?.lying??0)*(1-THREE.MathUtils.smoothstep(progress,0,.45));
    }
    if(this.phase==='reaching')reach=THREE.MathUtils.smoothstep(progress,.25,.9);
    return {seated,lying,reach};
  }
  get bedOpening() {
    const step=this.segment;
    if(!step?.blanket)return 0;
    return THREE.MathUtils.lerp(...step.blanket,THREE.MathUtils.smoothstep(step.elapsed/step.duration,0,1));
  }
  next() {
    const step=this.segments.shift();
    if(!step) { this.segment=null; this.phase={desk:'typing',bed:'resting'}[this.intent]??'idle'; return; }
    const distance=this.position.distanceTo(step.to);
    if(distance<.02&&!step.duration) { this.next(); return; }
    this.segment={...step,from:this.position.clone(),fromHeading:this.heading,walkStart:!['walking','returning'].includes(this.phase),walkEnd:!['walking','returning'].includes(this.segments[0]?.phase),elapsed:0,duration:step.duration ?? Math.max(.2,distance/(layout.speed??1.25))};
    this.phase=step.phase;
    this.segment.heading ??= Math.atan2(step.to.x-this.position.x,step.to.z-this.position.z);
  }
  update(dt) {
    if(this.segment) {
      const step=this.segment;
      step.elapsed+=dt;
      const progress=Math.min(1,step.elapsed/step.duration);
      let eased=progress*progress*(3-2*progress);
      if(['walking','returning'].includes(step.phase)){
        // Keep momentum across path corners; ease only the route's ends.
        const t=progress;
        eased+=(step.walkStart?0:1)*(t*t*t-2*t*t+t)+(step.walkEnd?0:1)*(t*t*t-t*t);
      }
      this.position.lerpVectors(step.from,step.to,eased);
      const hop=step.phase==='sitting'||step.phase==='lying'||(step.phase==='standing'&&(layout.stand||step.to.y<this.position.y-.4));
      if(hop) {
        // Lift clear of the armrest/mattress before moving across its edge,
        // then lower onto the support. A single diagonal hop clips on entry.
        const leaving=step.phase==='standing',bed=step.phase==='lying'||step.fromPose?.bed;
        const across=THREE.MathUtils.smoothstep(progress,leaving?.4:.20,leaving?.82:.68);
        this.position.lerpVectors(step.from,step.to,across);
        const crest=Math.max(step.from.y,step.to.y)+(bed?.22:.34),upEnd=leaving?.3:.35,downStart=leaving?.72:bed?.80:.68;
        this.position.y=progress<upEnd?THREE.MathUtils.lerp(step.from.y,crest,THREE.MathUtils.smoothstep(progress,0,upEnd)):
          THREE.MathUtils.lerp(crest,step.to.y,THREE.MathUtils.smoothstep(progress,downStart,.95));
        // Brief weight transfer as the body settles onto the support.
        if(!leaving)this.position.y-=.012*Math.sin(Math.PI*THREE.MathUtils.smoothstep(progress,.85,1));
      }
      const difference=Math.atan2(Math.sin(step.heading-this.heading),Math.cos(step.heading-this.heading));
      if(['aligning','reaching','lying','sitting'].includes(step.phase)){
        const turn=Math.atan2(Math.sin(step.heading-step.fromHeading),Math.cos(step.heading-step.fromHeading));
        this.heading=step.fromHeading+turn*THREE.MathUtils.smoothstep(progress,0,.45);
      }else this.heading+=difference*Math.min(1,dt*10);
      if(progress===1) { this.position.copy(step.to); this.next(); }
    } else {
      const target=this.intent==='desk'?layout.sitHeading:this.intent==='bed'?(layout.bed.heading??0):this.intent==='visit'?this.visit.heading:layout.idleHeading;
      const difference=Math.atan2(Math.sin(target-this.heading),Math.cos(target-this.heading));
      this.heading+=difference*Math.min(1,dt*8);
    }
  }
}
