import {createBoost} from './boost.js';
import {createSingularityEngine} from './singularity-engine.js';

// Racing and the hangar use the same engines and visual settings.
// Contract: stats, clear, setQuality, update, updatePost, dispose.
const ENGINES={flame:createBoost,singularity:createSingularityEngine};
export const createEngine=(renderer,scene,ship,options)=>ENGINES[ship.config.engine??'flame'](renderer,scene,ship,options);
