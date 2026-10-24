import {createDialKit as createKit,createDialRoot as createRoot} from 'dialkit/vanilla';

// Runtime values still drive the game; the editor and saved experiments are
// development-only. Production always starts from the committed defaults.
export function createDialKit(name,config,options={}){
  return createKit(name,config,{...options,persist:import.meta.env.DEV?options.persist:false,
    shortcuts:import.meta.env.DEV?options.shortcuts:undefined});
}

export function createDialRoot(options={}){
  return createRoot({...options,productionEnabled:import.meta.env.DEV});
}
