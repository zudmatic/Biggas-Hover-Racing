import * as THREE from 'three';
import {EYE_DEFAULTS,EYE_RANGES} from './eye-settings';

const RX=.285,RY=.23,CY=-.015;
const clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;

// The head itself forms the eyelids: trimming the white and pupil reveals
// continuous skin, without raised patches or a second skin material layer.
// No screen-space masks: side views, comic contours and depth all agree.
export function createZudEyes(head,{white,pupil},initial=EYE_DEFAULTS) {
  const root=new THREE.Group();root.name='Ojos de Zud';
  let settings={...EYE_DEFAULTS},openness=1,lastPose=1;
  let headBuckets=null;
  const grid=24;
  const entries=[-1,1].map(side=>{
    const eye=new THREE.Group();eye.position.set(side*.435,.14,0);root.add(eye);
    const make=(name,material,part)=>{
      const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.name=name;mesh.userData.eyePart=part;eye.add(mesh);return mesh;
    };
    return {side,eye,white:make('Blanco del ojo',white,'eye'),pupil:make('Pupila',pupil,'pupil'),
      crease:make('Párpado cerrado',pupil,'pupil')};
  });
  function bounds(x,side) {
    const radius=RY*Math.sqrt(Math.max(0,1-(x/RX)**2)),bottom=CY-radius,top=CY+radius;
    const slope=side*Math.tan(THREE.MathUtils.degToRad(settings.eyeTilt));
    // A slight brow arc preserves the original descending, inward expression.
    const cut=clamp(CY+RY*(2*settings.eyeOpening-1)+slope*x+.35*x*x,bottom,top);
    const seam=clamp(CY-.035+slope*x*.25-.025*(1-(x/RX)**2),bottom,top);
    const phase=settings.eyeOpening===0?0:openness;
    return {bottom,top,lower:lerp(seam,bottom,phase),upper:lerp(seam,cut,phase),seam};
  }
  function baseSurface(x,y,side) {
    if(headBuckets) {
      const i=clamp(Math.floor((x/RX+1)*grid/2),0,grid-1),j=clamp(Math.floor(((y-CY)/RY+1)*grid/2),0,grid-1);
      let result=null;
      for(const triangle of headBuckets[side===-1?0:1][j*grid+i]) {
        const {a,b,c,denominator}=triangle;
        const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/denominator;
        const v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/denominator,w=1-u-v;
        if(Math.min(u,v,w)<-1e-6)continue;
        const z=u*a.z+v*b.z+w*c.z;
        if(!result||z>result.z){const nx=u*a.nx+v*b.nx+w*c.nx,ny=u*a.ny+v*b.ny+w*c.ny,nz=u*a.nz+v*b.nz+w*c.nz;result={z,dx:-nx/Math.max(.1,nz),dy:-ny/Math.max(.1,nz)};}
      }
      if(result)return result;
    }
    const gx=x+side*.435,gy=y+.14,z=head.z*Math.sqrt(Math.max(.05,1-(gx/head.x)**2-((gy-head.centerY)/head.y)**2));
    return {z,dx:-head.z*head.z*gx/(head.x*head.x*z),dy:-head.z*head.z*(gy-head.centerY)/(head.y*head.y*z)};
  }
  function surface(x,y,side,lift=0,flush=false) {
    const base=baseSurface(x,y,side),gx=x+side*.435,gy=y+.14;
    const edge=Math.max(0,1-(x/RX)**2-((y-CY)/RY)**2),depth=settings.eyeDepth;
    const t=clamp(edge/.2,0,1),mask=t*t*(3-2*t),maskDerivative=edge<.2?6*t*(1-t)/.2:0;
    const rise=flush?0:(.010+depth*edge*edge+lift)*mask;
    const derivative=flush?0:2*depth*edge*mask+(.010+depth*edge*edge+lift)*maskDerivative;
    const normal=new THREE.Vector3(-base.dx+derivative*2*x/(RX*RX),-base.dy+derivative*2*(y-CY)/(RY*RY),1).normalize();
    return {position:[x,y,base.z+.004+rise],normal:normal.toArray(),uv:[Math.atan2(gx,base.z)/(Math.PI*2)+.5,(gy-head.centerY+head.y)/(2*head.y)]};
  }
  function meshHeight(geometry) {
    const buckets=Array.from({length:grid*grid},()=>[]),p=geometry.attributes.position;
    const column=x=>clamp(Math.floor((x/RX+1)*grid/2),0,grid-1);
    const row=y=>clamp(Math.floor(((y-CY)/RY+1)*grid/2),0,grid-1);
    for(let i=0;i<p.count;i+=3) {
      const [a,b,c]=[0,1,2].map(k=>({x:p.getX(i+k),y:p.getY(i+k),z:p.getZ(i+k)}));
      const denominator=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
      if(Math.abs(denominator)<1e-10)continue;
      const triangle={a,b,c,denominator};
      for(let y=row(Math.min(a.y,b.y,c.y));y<=row(Math.max(a.y,b.y,c.y));y++)
        for(let x=column(Math.min(a.x,b.x,c.x));x<=column(Math.max(a.x,b.x,c.x));x++)buckets[y*grid+x].push(triangle);
    }
    return (x,y)=>{
      let height=-Infinity;
      for(const {a,b,c,denominator} of buckets[row(y)*grid+column(x)]) {
        const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/denominator;
        const v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/denominator,w=1-u-v;
        if(Math.min(u,v,w)>=-1e-6)height=Math.max(height,u*a.z+v*b.z+w*c.z);
      }
      return height;
    };
  }
  function strip(mesh,side,minX,maxX,columns,rows,limits,lift=0,underneath=null,flush=false) {
    const positions=[],normals=[],uvs=[],segments=[];
    const onSurface=(x,y)=>{
      const point=surface(x,y,side,lift,flush);
      if(underneath)point.position[2]=Math.max(point.position[2],underneath(x,y)+.002);
      return point;
    };
    const point=(x,row)=>{const [low,high]=limits(x);return onSurface(x,lerp(low,Math.max(low,high),row/rows));};
    const triangle=(a,b,c,level=0)=>{
      const area=(b.position[0]-a.position[0])*(c.position[1]-a.position[1])-(b.position[1]-a.position[1])*(c.position[0]-a.position[0]);
      if(Math.abs(area)<1e-10)return;
      const x=(a.position[0]+b.position[0]+c.position[0])/3,y=(a.position[1]+b.position[1]+c.position[1])/3;
      if(level<2&&(headBuckets||underneath)&&(a.position[2]+b.position[2]+c.position[2])/3<Math.max(baseSurface(x,y,side).z+.001,underneath?underneath(x,y)+.001:-Infinity)) {
        const middle=(p,q)=>onSurface((p.position[0]+q.position[0])/2,(p.position[1]+q.position[1])/2);
        const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a);
        triangle(a,ab,ca,level+1);triangle(ab,b,bc,level+1);triangle(ca,bc,c,level+1);triangle(ab,bc,ca,level+1);return;
      }
      for(const p of [a,b,c]){positions.push(...p.position);normals.push(...p.normal);uvs.push(...p.uv);}
    };
    for(let i=0;i<columns;i++) {
      let left=lerp(minX,maxX,i/columns),right=lerp(minX,maxX,(i+1)/columns);
      const visible=x=>{const [low,high]=limits(x);return high-low>1e-8;};
      const leftVisible=visible(left),rightVisible=visible(right);
      if(!leftVisible&&!rightVisible)continue;
      if(leftVisible!==rightVisible) {
        let low=left,high=right;
        for(let iteration=0;iteration<18;iteration++){const mid=(low+high)/2;if(visible(mid)===leftVisible)low=mid;else high=mid;}
        if(leftVisible)right=low;else left=high;
      }
      segments.push({left,right,start:limits(left),end:limits(right)});
      for(let j=0;j<rows;j++) {
        const a=point(left,j),b=point(right,j),c=point(right,j+1),d=point(left,j+1);
        triangle(a,b,c);triangle(a,c,d);
      }
    }
    const geometry=mesh.geometry;
    // Fixed-capacity buffers prevent GPU allocations as the aperture changes.
    // count and drawRange expose only the live triangles to bounds and raycasts.
    for(const [key,values,size] of [['position',positions,3],['normal',normals,3],['uv',uvs,2],['uv1',uvs.map(v=>v*8),2]]) {
      let attribute=geometry.getAttribute(key);
      if(!attribute){attribute=new THREE.BufferAttribute(new Float32Array(columns*rows*6*16*size),size).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(key,attribute);}
      attribute.array.set(values);attribute.count=values.length/size;
      attribute.clearUpdateRanges();if(values.length)attribute.addUpdateRange(0,values.length);attribute.needsUpdate=true;
    }
    geometry.setDrawRange(0,positions.length/3);
    geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.visible=positions.length>0;
    return segments;
  }
  function rebuild() {
    for(const entry of entries) {
      const {side,eye}=entry;
      const aperture=x=>{const b=bounds(x,side);return [b.lower,b.upper];};
      const outline=strip(entry.white,side,-RX,RX,40,6,aperture);
      // Clip to the rendered polygon, including its discretized oval edge.
      // Analytic ellipse bounds alone can leave tiny pupil slivers outside it.
      const visibleAperture=x=>{
        const segment=outline.find(part=>x>=part.left&&x<=part.right);
        if(!segment)return [0,-1];
        const t=(x-segment.left)/(segment.right-segment.left);
        return segment.start.map((value,index)=>lerp(value,segment.end[index],t));
      };
      // Rest the pupils slightly inward and higher, as in the original gaze.
      // The upper lids then cover roughly half of each circle at neutral.
      const radius=.12*settings.pupilSize,cx=-side*.025+settings.gazeX*.12,cy=.005+settings.gazeY*.115;
      strip(entry.pupil,side,Math.max(-RX,cx-radius),Math.min(RX,cx+radius),36,4,x=>{
        const [lower,upper]=visibleAperture(x),r=Math.sqrt(Math.max(0,radius*radius-(x-cx)**2));
        return [Math.max(cy-r,lower),Math.min(cy+r,upper)];
      },.004,meshHeight(entry.white.geometry));
      strip(entry.crease,side,-RX*.88,RX*.88,32,1,x=>{const b=bounds(x,side);return [b.seam-.0025,b.seam+.0025];},0,null,true);
      entry.crease.visible=openness*settings.eyeOpening<.025;
      if(openness<.015||settings.eyeOpening===0){entry.white.visible=false;entry.pupil.visible=false;}
      eye.userData.aperture=openness*settings.eyeOpening;
    }
  }
  function configure(input) {
    const next={...settings};
    for(const [key,[min,max]] of Object.entries(EYE_RANGES))if(Number.isFinite(input[key]))next[key]=clamp(input[key],min,max);
    const changed=Object.keys(EYE_RANGES).some(key=>next[key]!==settings[key]);settings=next;
    if(changed||!entries[0].white.geometry.getAttribute('position'))rebuild();
  }
  const controller={root,configure,
    setHeadSurface(mesh){
      // Bin the actual front triangles in XY. Exact barycentric projection is
      // cheap during a blink and follows both the faceted and rounded head.
      const position=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal,indices=mesh.geometry.index;
      headBuckets=[-1,1].map(side=>{
        const buckets=Array.from({length:grid*grid},()=>[]);
        for(let i=0;i<(indices?.count??position.count);i+=3) {
          const [a,b,c]=[0,1,2].map(offset=>{
            const index=indices?indices.getX(i+offset):i+offset;
            return {x:position.getX(index)*head.x-side*.435,y:position.getY(index)*head.y+head.centerY-.14,z:position.getZ(index)*head.z,
              nx:normals.getX(index)/head.x,ny:normals.getY(index)/head.y,nz:normals.getZ(index)/head.z};
          });
          const minX=Math.min(a.x,b.x,c.x),maxX=Math.max(a.x,b.x,c.x),minY=Math.min(a.y,b.y,c.y),maxY=Math.max(a.y,b.y,c.y);
          if(Math.max(a.z,b.z,c.z)<0||maxX<-RX||minX>RX||maxY<CY-RY||minY>CY+RY)continue;
          const denominator=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(denominator)<1e-10)continue;
          const column=x=>clamp(Math.floor((x/RX+1)*grid/2),0,grid-1),row=y=>clamp(Math.floor(((y-CY)/RY+1)*grid/2),0,grid-1);
          const triangle={a,b,c,denominator};
          for(let y=row(minY);y<=row(maxY);y++)for(let x=column(minX);x<=column(maxX);x++)buckets[y*grid+x].push(triangle);
        }
        return buckets;
      });
      rebuild();
    },
    pose(amount,dt=1/60,immediate=false){
      const target=clamp(amount,0,1);
      openness=immediate?target:lerp(openness,target,1-Math.exp(-dt*(target<openness?32:18)));
      if(Math.abs(openness-target)<.002)openness=target;
      if(Math.abs(openness-lastPose)>.001||immediate){lastPose=openness;rebuild();}
    },
  };
  configure(initial);return controller;
}
