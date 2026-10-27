import {Color,Vector3} from 'three';

// Tuning in the GLB's authoring units. The game scales the ship, not these numbers.
export const THRUST={idle:.2,cruise:1,rate:2.5};
export const BOOST_RATIO=2.5;
export const ENERGY={surge:{gain:2.2,attack:3,decay:1.4},drag:{turn:.9,slip:.06,max:1.4,rate:5}};
export const SINGULARITY={
  offset:-.31,surge:.35,
  horizon:{radius:{idle:.29,cruise:.3},softness:.24,absorption:1},
  lensing:{strength:1.7,reach:1.6,spin:-.21,cap:.26},
  wake:{absorption:.2},
  infall:{halo:2.05,dimming:.31,streaks:.69,spiral:.9},
  glow:{width:.58,turbulence:.68,hotspots:2.6,speed:1.9,intensity:{idle:1.85,cruise:2.65},colors:{hot:new Color('#d6ecff')}},
  turbulence:{mode:'both',waves:{amplitude:.1,frequency:2.8,speed:2.8,length:2.5,width:1.45}},
  instability:{amount:.125,speed:2.05},
  depth:{softness:.35,edge:.05},
};
export const PLASMA_QUALITY={
  low:{tongues:4,segments:10,coils:24,detail:false},
  medium:{tongues:6,segments:14,coils:36,detail:true},
  high:{tongues:8,segments:20,coils:48,detail:true},
};
export const PLASMA={
  quality:'high',intensity:1,bloom:1,
  colors:{shard:new Color('#05070d'),base:new Color('#2f5bff'),hot:new Color('#d6ecff'),burst:[new Color('#7a2cff'),new Color('#ff2bd6'),new Color('#22e8ff')]},
  flow:{direction:new Vector3(0,0,-1),scale:.55,cycles:3},
  drive:{
    speed:{idle:.25,cruise:1.1,boost:3.2,surge:.8},
    length:{idle:.5,cruise:1.3,boost:2.6,surge:.5},
    sweep:{idle:.15,cruise:.85,boost:1,surge:.2},
    turbulence:{idle:.3,cruise:.5,boost:1.2,surge:.6},
    density:{idle:1.5,cruise:2.4,boost:4,surge:.3},
    emission:{idle:.7,cruise:1.3,boost:2.8,surge:.6},
    burst:{idle:0,cruise:0,boost:1,surge:.3},
  },
  filaments:{width:.012,coverage:.4},
  edge:{emission:1.4,width:1.3,reach:.04,crease:.985},
  hotspots:{gain:4,sharpness:6},
  burst:{flicker:.6,rate:23,drift:.15,heat:.4},
  tongues:{width:.22,lift:.5,bend:.3,spacing:.5},
  coils:{strands:3,turns:1.75,spin:2.2,start:-.45,length:.75,radius:.42,inner:.2,width:.035,wobble:.5},
  light:{intensity:1.5,distance:6,decay:2,lift:.6},
};
