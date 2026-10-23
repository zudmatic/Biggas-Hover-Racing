// Work is a room activity. Navigation changes the pose without covering the
// scene or capturing its scroll, pointer and keyboard controls.
export function createWorkNavigation({stage,canvas,onEnter,onLeave}) {
  const workLink=document.querySelector('#work-link');
  const homeLink=document.querySelector('.nav-links a');
  let working=false,syncing=false;
  function setWorking(value) {
    working=value;
    stage.dataset.section=value?'work':'home';
    workLink.toggleAttribute('aria-current',value);
    homeLink.toggleAttribute('aria-current',!value);
    (value?workLink:homeLink).setAttribute('aria-current','page');
    if(!syncing){
      const url=new URL(location.href);
      if(value)url.hash='work';else if(url.hash==='#work')url.hash='';
      if(url.href!==location.href)history.pushState(null,'',url);
    }
  }
  function syncLocation() {
    syncing=true;
    try {
      if(location.hash==='#work'){
        if(!working)onEnter();
        if(!working){const url=new URL(location.href);url.hash='';history.replaceState(history.state,'',url);}
      }else if(working)onLeave();
    }finally{syncing=false;}
  }
  const plainClick=event=>event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey;
  workLink.addEventListener('click',event=>{
    if(!plainClick(event))return;
    event.preventDefault();onEnter();canvas.focus({preventScroll:true});
  });
  for(const link of [homeLink,document.querySelector('.site-logo')])link.addEventListener('click',event=>{
    if(!plainClick(event))return;
    event.preventDefault();onLeave();canvas.focus({preventScroll:true});
  });
  window.addEventListener('popstate',syncLocation);
  window.addEventListener('hashchange',syncLocation);
  stage.dataset.section='home';
  return {setWorking,syncLocation};
}
