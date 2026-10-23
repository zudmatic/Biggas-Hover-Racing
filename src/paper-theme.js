// The page follows the light of the scene. Darkness is what the scene already knows:
//
//   darkness = night + (1 - night) * blind        (= 1 - daylight, blinds included)
//
// night comes from the clock (1 - daylight) and blind is how far the blind has come
// down. The transition follows its cause rather than fading uniformly:
//
//   - A closing blind lowers a curtain of darkness from the top edge of the page,
//     tied to the blind's own progress, so the paper darkens as the cloth falls.
//   - Nightfall comes in from the top too (the sky goes first, the horizon holds
//     out longest), with a warm dusk tint riding its front.
//   - Both edges are a halftone wipe: dots grow until they close into solid dark.
//   - The lamp that turns on in the dark warms the paper around it.
//
// Paper (the canvas) and the page's CSS (background, UI colors) share the same
// numbers. The clock's night is smoothed over `themeSpeed` seconds so a jump of the
// hands is a transition, not a cut; the blind is already animated by the room, so
// its curtain follows it directly. Colors are sRGB 0..1 (the print blends after the
// sRGB encode). At darkness 0 the paper is exactly PAPER_COLOR.

const parse=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const mixColor=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const luma=c=>c[0]*.299+c[1]*.587+c[2]*.114;
const byte=v=>Math.round(Math.min(1,Math.max(0,v))*255);
const css=(c,alpha)=>alpha===undefined?`rgb(${c.map(byte).join(' ')})`:`rgb(${c.map(byte).join(' ')} / ${alpha.toFixed(3)})`;

// UI colors of the two themes (the light ones are what style.css had before).
const UI_LIGHT={ink:'#262626',muted:'#777777',panel:'#ffffff',panelAlpha:.92,edge:'#e3dfe8',hover:'#efecf3',pressedBg:'#262626',pressedInk:'#ffffff'};
const UI_DARK={ink:'#ece8f5',muted:'#9d97ad',panel:'#1e1b2a',panelAlpha:.92,edge:'#3b3650',hover:'#2b2740',pressedBg:'#ece8f5',pressedInk:'#15121f'};

export function createPaperTheme({post,params,root=null}) {
  let night=0;
  const state={night:0,blind:0,dark:0,theme:'light'};
  const written=new Map();
  const setVariable=(name,value)=>{if(root&&written.get(name)!==value){written.set(name,value);root.style.setProperty(name,value);}};

  function update({dt=1/60,daylight=1,blind=0,lampUv=[.5,.5],look='comic',reducedMotion=false}={}) {
    const p=params();
    const targetNight=p.themeOn?1-daylight:0,targetBlind=p.themeOn?blind:0;
    if(reducedMotion||Math.abs(targetNight-night)<.002)night=targetNight;
    else night+=(targetNight-night)*(1-Math.exp(-dt*3.5/Math.max(p.themeSpeed,.05)));
    const dark=Math.min(1,night+(1-night)*targetBlind);
    Object.assign(state,{night,blind:targetBlind,dark});
    if(dark>.55)state.theme='dark';else if(dark<.45)state.theme='light';

    // Black & white keeps the page neutral too.
    const gray=c=>look==='mono'?[luma(c),luma(c),luma(c)]:c;
    const paperLight=parse(p.paper),paperDark=gray(parse(p.paperDark));

    // Frame pass: the paper's spatial rules live in the shader (retro-print.js).
    post.uThemeA.value.set(night,targetBlind*1.2,0,p.themeDots?p.themeDotPitch:0);
    post.uThemeB.value.set(1,dark*p.themeGlowStrength,.55,dark>.0005?1:0);
    post.uLampUv.value.set(lampUv[0],lampUv[1]);
    post.uPaperDark.value.set(...paperDark);
    post.uPaperDusk.value.set(...gray(parse(p.themeDusk)));
    post.uPaperGlow.value.set(...gray(parse(p.themeGlow)));
    const ink=gray(mixColor(parse(p.bgInk),parse(p.bgInkNight),dark));
    post.uBgInk.value.set(ink[0],ink[1],ink[2],post.uBgInk.value.w);

    // Page: the same paper, flat (the canvas covers it), and the UI colors.
    setVariable('--paper',css(mixColor(paperLight,paperDark,dark)));
    for(const key of ['ink','muted','edge','hover','pressedBg','pressedInk'])
      setVariable(`--${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}`,css(gray(mixColor(parse(UI_LIGHT[key]),parse(UI_DARK[key]),dark))));
    setVariable('--panel',css(gray(mixColor(parse(UI_LIGHT.panel),parse(UI_DARK.panel),dark)),UI_LIGHT.panelAlpha));
    return {...state};
  }
  return {state,update};
}
