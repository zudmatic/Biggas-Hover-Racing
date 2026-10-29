export interface ForestAmbience {
  setActive(active:boolean):void;
  update(environment:{falls?:number;wind?:number;gallery?:number;train?:number;trainApproach?:number}):void;
  dispose():void;
}
export function createBiggasAmbience(context:AudioContext,master:AudioNode,engine:AudioNode,noise:AudioBuffer):ForestAmbience;
