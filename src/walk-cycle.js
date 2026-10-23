// A complete left/right stride covers .74 world units by default (shorter legs
// pass a shorter one). Advancing by actual displacement keeps the feet in sync
// with movement, including wall sliding and automatic walks.
export class WalkCycle {
  constructor() {this.phase=0;this.weight=0;}
  update(distance,dt,enabled=true,stride=.74) {
    if(!enabled){this.weight=0;return this.sample();}
    const moving=distance>.00001;
    this.weight+=(Number(moving)-this.weight)*(1-Math.exp(-dt*16));
    if(moving)this.phase=(this.phase+distance/stride*Math.PI*2)%(Math.PI*2);
    if(this.weight<.001)this.weight=0;
    return this.sample();
  }
  sample() {
    const wave=Math.cos(this.phase);
    return {
      weight:this.weight,phase:this.phase,
      bob:(1-Math.cos(this.phase*2))*.04,
      lean:.10,roll:Math.sin(this.phase)*.065,
      feet:[0,Math.PI].map(offset=> {
        const phase=this.phase+offset,lift=Math.max(0,-Math.sin(phase));
        return {stride:Math.cos(phase)*.42,lift:lift*.27,pitch:-lift*.30};
      }),
      arms:[wave*.65,-wave*.65],
    };
  }
}
