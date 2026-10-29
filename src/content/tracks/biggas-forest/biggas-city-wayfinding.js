import * as THREE from 'three';

const sidePoint=(p,offset,height=0)=>new THREE.Vector3(p.x-p.nz*offset,p.y+height+(p.bank??0)*offset,p.z+p.nx*offset);

// Shopfronts and district signs face the roadway. Frames and brackets reuse
// existing material batches; all lettering shares the train's single atlas.
export function addBiggasWayfinding({routes,add,box,beam,palette,setZone,signage}){
  const panels=[];
  function board(p,offset,height,width,panelHeight,row,{twoSided=false}={}){
    const normal=new THREE.Vector3(p.nz*Math.sign(offset),0,-p.nx*Math.sign(offset)),yaw=Math.atan2(normal.x,normal.z),center=sidePoint(p,offset,height),right=new THREE.Vector3(normal.z,0,-normal.x);
    box(center,[width+.24,panelHeight+.24,.24],palette.metal,yaw);
    for(const s of [-1,1]){
      box(center.clone().addScaledVector(right,s*(width/2+.08)).addScaledVector(normal,.16),[.1,panelHeight+.2,.08],palette.cream,yaw);
      box(center.clone().add(new THREE.Vector3(0,s*(panelHeight/2+.08),0)).addScaledVector(normal,.16),[width+.24,.1,.08],palette.cream,yaw);
    }
    const geometry=signage.panel(row,width,panelHeight),face=center.clone().addScaledVector(normal,.17);add(geometry,signage.material,face,undefined,new THREE.Euler(0,yaw,0));geometry.dispose();
    if(twoSided){const back=signage.panel(row,width,panelHeight);add(back,signage.material,center.clone().addScaledVector(normal,-.17),undefined,new THREE.Euler(0,yaw+Math.PI,0));back.dispose();}
    panels.push({row,position:center,normal,width,height:panelHeight,twoSided});return {center,right};
  }
  setZone('market');const market=routes.branches[0];
  for(const [fraction,side] of [[.67,-1]]){
    const p=routes.onBranch(market,fraction),{center,right}=board(p,side*15,5.5,11,2.75,3,{twoSided:true});
    for(const offset of [-4.7,4.7]){const top=center.clone().addScaledVector(right,offset).add(new THREE.Vector3(0,-1.45,0)),foot=top.clone().setY(sidePoint(p,side*15).y-.4);beam(foot,top,.13,palette.metal);}
  }
  for(const f of [.31,.54,.71]){
    const p=routes.onBranch(market,f),a=sidePoint(p,-14,10.5),b=sidePoint(p,14,10.5),curve=new THREE.QuadraticBezierCurve3(a,sidePoint(p,0,8),b),g=new THREE.TubeGeometry(curve,12,.045,4,false);add(g,palette.metal);g.dispose();
    beam(sidePoint(p,-14),a,.12,palette.metal);beam(sidePoint(p,14),b,.12,palette.metal);
  }
  return {boards:panels.length,panels};
}
