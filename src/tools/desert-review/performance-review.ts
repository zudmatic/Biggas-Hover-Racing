// Opt-in local measurement UI. It never drives the vehicle or changes saved
// graphics preferences. Readable results make browser comparisons repeatable.
export function mountDesertPerformanceReview({app,renderer,benchmark,graphics,world}){
  const panel=document.createElement('section');panel.className='desert-perf-review';
  panel.style.cssText='position:fixed;right:12px;top:12px;z-index:10000;background:#101820eb;color:white;padding:12px;max-width:460px;font:12px monospace';
  const button=document.createElement('button');button.textContent='Medir 5 s';
  const output=document.createElement('pre');output.id='desert-perf-result';output.style.cssText='max-height:58vh;overflow:auto;white-space:pre-wrap';output.textContent='Listo para medir; calidad fija, DPR 1.';
  const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin:8px 0';
  const add=(label,action)=>{const control=document.createElement('button');control.textContent=label;control.onclick=action;controls.append(control);};
  add('Look base',()=>graphics.look?.setOverride('base'));
  add('PS2 estable',()=>graphics.look?.setOverride('ps2'));
  add('Probar tembleque',()=>graphics.look?.setOverride('jitter'));
  add('Post apagado',()=>graphics.setPostEnabled(false));
  add('Post encendido',()=>graphics.setPostEnabled(true));
  let trainRunning=false;
  add('Tren en movimiento',()=>{world.train.reset();world.train.step(7.99);world.train.step(.02);world.train.step(6);trainRunning=true;});
  add('Tren detenido',()=>{trainRunning=false;world.train.reset();});
  panel.append(button,controls,output);document.body.append(panel);
  let started=0,rows=[];
  button.onclick=()=>{rows=[];started=performance.now();benchmark.resetSamples();button.disabled=true;output.textContent='Midiendo durante 5 segundos…';};
  const mean=values=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
  const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)]??0;
  return {get trainRunning(){return trainRunning;},sample(frameMs,workMs){
    if(!started)return;
    rows.push({frameMs,workMs,render:{...renderer.info.render}});
    if(performance.now()-started<5000)return;
    const summary=benchmark.snapshot(),render={};
    for(const key of Object.keys(rows[0].render))if(typeof rows[0].render[key]==='number')render[key]={mean:mean(rows.map(x=>x.render[key])),max:Math.max(...rows.map(x=>x.render[key]))};
    const resources=performance.getEntriesByType('resource').filter(x=>/\/(models\/desert-valley|textures\/|draco\/)/.test(x.name));
    const result={view:app.dataset.artView,backend:summary.backend,look:app.dataset.look,settings:graphics.look?.settings,postEnabled:graphics.postEnabled,trainMoving:trainRunning,trainActive:world.train.active,viewport:summary.viewport,pixelRatio:summary.pixelRatio,quality:'fixed high / 4x MSAA / DPR 1',visibility:document.visibilityState,userAgent:navigator.userAgent,durationMs:performance.now()-started,frames:rows.length,fps:1000/mean(rows.map(x=>x.frameMs)),frameMs:mean(rows.map(x=>x.frameMs)),p95Ms:percentile(rows.map(x=>x.frameMs),.95),p99Ms:percentile(rows.map(x=>x.frameMs),.99),maxFrameMs:Math.max(...rows.map(x=>x.frameMs)),workMs:mean(rows.map(x=>x.workMs)),render,memory:summary.memory,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,lod:summary.lod,load:{worldReadyMs:Number(app.dataset.worldReadyMs),compileMs:Number(app.dataset.compileMs),resources:resources.map(x=>({name:x.name.split('/').pop(),durationMs:x.duration,transferBytes:x.transferSize,encodedBytes:x.encodedBodySize}))}};
    output.textContent=JSON.stringify(result,null,2);button.disabled=false;started=0;
  },dispose(){panel.remove();}};
}
