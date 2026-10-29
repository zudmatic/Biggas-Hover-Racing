import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const citySignPanels=[
  {title:'TALLER BIGGAS',subtitle:'SERVICIO HOVER · MECÁNICA',color:'#edb457',icon:'tool'},
  {title:'CAFÉ DEL ANDÉN',subtitle:'CAFÉ · PAN · ENCUENTROS',color:'#8cc6b5',icon:'coffee'},
  {title:'MERCADO 039',subtitle:'PRODUCTOS LOCALES · ESTACIÓN',color:'#ee9a7c',icon:'market'},
  {title:'BIGGAS CITY',subtitle:'DISTRITO CENTRAL · 039',color:'#92bed3',icon:'city'},
  {title:'ESTACIÓN CENTRAL',subtitle:'B39 · FERROCARRIL URBANO',color:'#edb457',icon:'train'},
  {title:'B39 · BIGGAS CITY',subtitle:'',color:'#edb457',icon:'train'},
];
const rows=8,rowHeight=256,atlasWidth=1024;
function icon(c,type,x,y){
  c.save();c.translate(x,y);c.strokeStyle='#17383a';c.fillStyle='#17383a';c.lineWidth=7;c.lineCap='round';c.lineJoin='round';
  if(type==='coffee'){
    c.strokeRect(-32,-17,53,38);c.beginPath();c.arc(24,0,15,-Math.PI/2,Math.PI/2);c.stroke();c.beginPath();c.moveTo(-41,33);c.lineTo(33,33);c.moveTo(-15,-33);c.quadraticCurveTo(-28,-44,-13,-55);c.stroke();
  }else if(type==='tool'){
    c.beginPath();c.moveTo(-27,36);c.lineTo(15,-10);c.stroke();c.beginPath();c.arc(23,-22,21,-.1,Math.PI*1.45);c.stroke();c.beginPath();c.arc(-29,39,8,0,Math.PI*2);c.stroke();
  }else if(type==='market'){
    c.strokeRect(-36,-10,72,45);c.beginPath();c.moveTo(-42,-10);c.lineTo(-29,-37);c.lineTo(29,-37);c.lineTo(42,-10);c.closePath();c.stroke();for(const x of [-18,0,18]){c.beginPath();c.moveTo(x,-36);c.lineTo(x,-8);c.stroke();}c.strokeRect(-9,11,18,24);
  }else if(type==='city'){
    for(const [x,h] of [[-35,46],[-8,79],[20,59]]){c.fillRect(x,36-h,21,h);c.fillStyle='#fff0d0';c.fillRect(x+8,43-h,5,6);c.fillRect(x+8,57-h,5,6);c.fillStyle='#17383a';}c.beginPath();c.moveTo(-43,40);c.lineTo(48,40);c.stroke();
  }else{
    c.strokeRect(-31,-43,62,70);c.fillRect(-22,-31,44,27);for(const x of [-18,18]){c.beginPath();c.arc(x,13,4,0,Math.PI*2);c.fill();}c.beginPath();c.moveTo(-19,29);c.lineTo(-31,44);c.moveTo(19,29);c.lineTo(31,44);c.stroke();
  }c.restore();
}
export function createBiggasSignage(){
  let texture;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=atlasWidth;canvas.height=rows*rowHeight;const c=canvas.getContext('2d');c.fillStyle='#17383a';c.fillRect(0,0,canvas.width,canvas.height);
    citySignPanels.forEach((panel,row)=>{
      const y=row*rowHeight;c.save();c.translate(0,y);c.strokeStyle=panel.color;c.lineWidth=3;c.strokeRect(15,15,994,226);
      if(row===5){c.fillStyle=panel.color;c.font='bold 82px sans-serif';c.textAlign='center';c.fillText(panel.title,512,158,940);c.restore();return;}
      c.fillStyle=panel.color;c.fillRect(27,27,156,202);icon(c,panel.icon,105,132);
      c.fillStyle=panel.color;c.font='bold 19px sans-serif';c.fillText('BIGGAS / DISTRITO 039',213,62);
      let font=65;c.font=`900 ${font}px sans-serif`;while(c.measureText(panel.title).width>764)c.font=`900 ${--font}px sans-serif`;
      c.fillStyle='#fff0d0';c.fillText(panel.title,208,139);c.fillStyle=panel.color;c.fillRect(213,162,754,3);
      c.fillStyle='#e4e5d4';c.font='bold 25px sans-serif';c.fillText(panel.subtitle,213,209,754);c.restore();
    });texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  }else{texture=new THREE.DataTexture(new Uint8Array([237,180,87,255]),1,1);texture.needsUpdate=true;}
  const material=new THREE.MeshBasicMaterial({name:'Biggas · cartelería urbana',map:texture});material.userData.circuitUntextured=true;
  function panel(row,width,height,{twoSided=false}={}){
    const front=new THREE.PlaneGeometry(width,height),uv=front.attributes.uv,padding=8;
    for(let i=0;i<uv.count;i++){uv.setX(i,(padding+uv.getX(i)*(atlasWidth-2*padding))/atlasWidth);uv.setY(i,(rows-1-row+(padding+uv.getY(i)*(rowHeight-2*padding))/rowHeight)/rows);}
    if(!twoSided)return front;
    const back=front.clone().rotateY(Math.PI).translate(0,0,-.04),merged=mergeGeometries([front,back]);front.dispose();back.dispose();return merged;
  }
  return {texture,material,panel,panels:citySignPanels,dispose(){texture.dispose();material.dispose();}};
}
