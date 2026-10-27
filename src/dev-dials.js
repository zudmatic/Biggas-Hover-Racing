import {createDialKit as createKit,createDialRoot as createRoot} from 'dialkit/vanilla';

// Nested folders are plain config objects (controls carry a `type`); start every one of them closed.
function collapseFolders(config){
  const out={};
  for(const [key,value] of Object.entries(config))
    out[key]=value&&typeof value==='object'&&!Array.isArray(value)&&!('type' in value)&&key!=='_collapsed'?{...collapseFolders(value),_collapsed:true}:value;
  return out;
}

// Runtime values still drive the game; the editor and saved experiments are
// development-only. Production always starts from the committed defaults.
// Every panel and folder starts collapsed, so the dials open on a short list of titles.
export function createDialKit(name,config,options={}){
  return createKit(name,collapseFolders(config),{...options,defaultCollapsed:true,persist:import.meta.env.DEV?options.persist:false,
    shortcuts:import.meta.env.DEV?options.shortcuts:undefined});
}

export function createDialRoot(options={}){
  return createRoot({...options,productionEnabled:import.meta.env.DEV});
}
