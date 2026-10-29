import {audio} from '@/audio';
import {createNoiseBuffer} from '@/audio/synth/noise';
import {createBiggasAmbience,type ForestAmbience} from './biggas-city-audio.js';
import {Track} from '../track';
import type {TrackUpdateContext} from '../track';
import type {TrackDefinition,TrackLoadOptions} from '../track-definition';
import type {HoverState,Position3} from '@/sim/hover-state';
import {loadForestRuntime,type ForestRuntime} from './runtime.js';

/** Typed track boundary around the procedural scenery and collision builders. */
export class ForestTrack extends Track {
  readonly root; readonly landscape; readonly textures; readonly fx;
  readonly surfaceHeight; override readonly clipCamera; readonly detailCount;
  private ambience:ForestAmbience|null=null;
  private constructor(readonly definition:TrackDefinition,private readonly runtime:ForestRuntime){
    super();this.root=runtime.root;this.landscape=runtime.landscape;this.textures=runtime.textures;
    this.fx=runtime.fx;this.surfaceHeight=runtime.surfaceHeight;this.clipCamera=runtime.clipCamera;this.detailCount=runtime.detailCount;
  }
  static async load(definition:TrackDefinition,options:TrackLoadOptions):Promise<ForestTrack>{return new ForestTrack(definition,await loadForestRuntime(definition,options));}
  step(state:HoverState,dt:number,previous?:Position3):void{this.runtime.step(state,dt,previous);}
  update(time:number,reduced:boolean,context:TrackUpdateContext):void{this.runtime.update(time,reduced,context);
    const output=audio.worldOutput,engine=audio.engineOutput;
    if(!this.ambience&&output&&engine)this.ambience=createBiggasAmbience(output.context,output.destination,engine,createNoiseBuffer(output.context));
    this.ambience?.setActive(Boolean(output?.active)&&context.phase==='flying');
    this.ambience?.update(this.runtime.adventure.ambienceAt(context.state));}
  reset():void{this.runtime.reset();}
  dispose():void{this.ambience?.dispose();this.runtime.dispose();}
}
