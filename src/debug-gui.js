import GUI from 'lil-gui';
import {RETRO_LOOKS,RETRO_VIEWS} from './retro-style.js';
import {formatTime} from './day-cycle.js';

// Dev-only tuning panel, loaded by main.js only for `?debug` in development.
// One folder per print layer with its on/off toggle, a view mode that isolates
// lightness, each band mask and each pattern layer, the three looks and a reset to Day.
export function createDebugGui({style,time}) {
  const gui=new GUI({title:'Retro print'});
  const params=style.params;
  params.view??='final';
  // Edits notify subscribers; the panel only refreshes for changes it did not make.
  let editing=false;
  const edit=()=>{editing=true;style.sync();editing=false;};
  const add=(folder,key,min,max,step,name=key)=>folder.add(params,key,min,max,step).name(name).onChange(edit);
  const color=(folder,key,name=key)=>folder.addColor(params,key).name(name).onChange(edit);

  // View mode, reset and the time of day (the print follows the day cycle).
  const scene={view:'final',lite:style.lite,preset:()=>{},time:time.get(),clock:formatTime(time.get())};
  gui.add(params,'look',RETRO_LOOKS).name('look (same as the buttons)').onChange(edit);
  gui.add(params,'view',RETRO_VIEWS).name('view mode').onChange(edit);
  // Every current value as JSON, ready to paste into a chat: the print parameters
  // plus the switches and the time of day that are not part of them.
  const snapshot=()=>JSON.stringify({params:{...params},lite:style.lite,minutes:Math.round(time.get()),clock:formatTime(time.get())},null,2);
  const copy=async text=>{
    try{await navigator.clipboard.writeText(text);}
    catch{
      // Not a secure context (e.g. opened by LAN IP): fall back to a hidden textarea.
      const area=Object.assign(document.createElement('textarea'),{value:text});
      area.style.cssText='position:fixed;opacity:0';document.body.append(area);area.select();
      const ok=document.execCommand('copy');area.remove();
      if(!ok)throw new Error('copy blocked');
    }
  };
  const copyButton=gui.add({copy:async()=>{
    try{await copy(snapshot());copyButton.name('Copied ✓');}
    catch{copyButton.name('Copy failed: see console');console.log(snapshot());}
    setTimeout(()=>copyButton.name('Copy all values'),1800);
  }},'copy').name('Copy all values');
  // Day is the only preset: the defaults. This button restores them after experiments.
  gui.add({reset:()=>{style.setPreset('day');refresh();}},'reset').name('Reset to Day');
  const mono=gui.addFolder('Black & white (look mono)');
  add(mono,'monoDetail',0,1,.01,'detail (0 = two-tone)');
  add(mono,'monoShadow',0,1,.01,'shadow depth');
  add(mono,'monoPattern',0,1,.01,'two-tone dots & hatching');
  const clock=gui.addFolder('Time of day');
  clock.add(scene,'time',0,1439,1).name('minutes').onChange(minutes=>{time.set(minutes);scene.clock=formatTime(minutes);clockLabel.updateDisplay();});
  const clockLabel=clock.add(scene,'clock').name('clock').disable();

  const general=gui.addFolder('Pattern');
  general.add(params,'space',['screen','object']).name('pattern space').onChange(edit);
  general.add(scene,'lite').name('lite path').onChange(on=>style.setLite(on));
  add(general,'strength',0,2,.01,'ink strength');
  add(general,'grain',0,1.5,.01);

  const bands=gui.addFolder('Bands & base');
  add(bands,'nightKeep',0,1,.01,'night keep');
  add(bands,'bandShadow',0,1,.005,'shadow edge');
  add(bands,'bandLight',0,1.2,.005,'highlight edge');
  add(bands,'bandSoft',.005,.3,.005,'edge softness');
  add(bands,'posterAmount',0,1,.01,'posterize');
  add(bands,'posterSteps',2,12,1,'steps');
  add(bands,'posterSoft',.01,.5,.01,'step softness');
  add(bands,'tintAmount',0,1,.01,'tint amount');
  color(bands,'shadowTint','shadow tint');
  color(bands,'lightTint','light tint');

  const highlight=gui.addFolder('Highlight dots');
  highlight.add(params,'hiOn').name('on').onChange(edit);
  add(highlight,'hiPitch',1.5,24,.1,'pitch (px)');
  add(highlight,'hiAngle',0,90,1,'angle');
  add(highlight,'hiOpacity',0,1.5,.01,'opacity');
  add(highlight,'hiCoverage',0,.6,.01,'coverage');
  color(highlight,'hiInk','ink');
  add(highlight,'hiGain',0,3,.01,'ink gain');

  const rim=gui.addFolder('Rim dots');
  rim.add(params,'rimOn').name('on').onChange(edit);
  add(rim,'rimCoverage',0,.6,.01,'coverage');
  add(rim,'rimPower',.5,6,.05,'power');
  add(rim,'rimStart',0,1,.01,'start');

  const hatch=gui.addFolder('Shadow hatching');
  hatch.add(params,'hatchOn').name('on').onChange(edit);
  add(hatch,'hatchPitch',1.5,20,.1,'pitch (px)');
  add(hatch,'hatchAngle',0,180,1,'angle');
  add(hatch,'hatchOpacity',0,1.5,.01,'opacity');
  add(hatch,'hatchCoverage',0,.7,.01,'coverage');
  add(hatch,'hatchSecond',0,1.5,.01,'crossing set');
  color(hatch,'hatchTint','ink');

  const outline=gui.addFolder('Outline');
  outline.add(params,'outlineOn').name('on').onChange(edit);
  add(outline,'outlineWidth',.5,4,.05,'width (px)');
  add(outline,'outlineThreshold',.05,1.5,.01,'crease threshold');
  add(outline,'outlineCrease',0,1,.01,'crease strength');
  add(outline,'outlineOpacity',0,1,.01,'opacity');
  color(outline,'outlineInk','ink');
  add(outline,'outlineTint',0,1,.01,'surface tint');

  const misreg=gui.addFolder('Misregistration');
  add(misreg,'misreg',0,8,.1,'base (px)');
  add(misreg,'misregEdge',0,8,.1,'extra at edges (px)');

  const grade=gui.addFolder('Grade & grain');
  add(grade,'gradeSaturation',.5,2,.01,'saturation');
  add(grade,'gradeContrast',.6,1.6,.01,'contrast');
  add(grade,'splitAmount',0,1,.01,'split tone');
  color(grade,'splitShadow','split shadow');
  color(grade,'splitLight','split light');
  add(grade,'inkGrain',0,.15,.001,'ink grain');
  add(grade,'paperGrain',0,.15,.001,'paper grain');

  const paper=gui.addFolder('Paper & background dots');
  color(paper,'paper','paper (match the page)');
  paper.add(params,'bgOn').name('dots on').onChange(edit);
  add(paper,'bgPitch',2,24,.1,'pitch (px)');
  add(paper,'bgAngle',0,90,1,'angle');
  add(paper,'bgReach',20,300,1,'reach (px)');
  add(paper,'bgCoverage',0,.7,.01,'coverage');
  color(paper,'bgInk','ink');
  add(paper,'bgOpacity',0,1,.01,'opacity');

  const theme=gui.addFolder('Page light (blind & night)');
  theme.add(params,'themeOn').name('on').onChange(edit);
  color(theme,'paperDark','dark paper');
  color(theme,'themeDusk','dusk tint');
  color(theme,'themeGlow','lamp glow');
  add(theme,'themeGlowStrength',0,.6,.01,'lamp glow strength');
  theme.add(params,'themeDots').name('halftone wipe').onChange(edit);
  add(theme,'themeDotPitch',3,30,.5,'wipe dot pitch (px)');
  add(theme,'themeSpeed',.1,5,.05,'night smoothing (s)');
  color(theme,'bgInkNight','halo ink at night');

  const twos=gui.addFolder('Animation on twos');
  twos.add(params,'twosOn').name('on').onChange(edit);
  add(twos,'twosFps',4,30,1,'fps');

  // Presets and the automatic lite switch change values behind the panel's back.
  function refresh() {
    scene.lite=style.lite;
    gui.controllersRecursive().forEach(controller=>controller.updateDisplay());
  }
  style.subscribe(()=>{if(!editing)refresh();});
  return gui;
}
