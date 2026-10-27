import {PAD_TRANSITION} from '../../sim/boost-pad-envelope';

// Approved laboratory preset, also used without DialKit in the game.
export const BOOST_PAD_PRESET=Object.freeze({
  transition:PAD_TRANSITION,duration:2,cooldown:7,flow:2.5,arrowCount:4,brightness:5,
  color:'#34ff76',activeColor:'#90e000',screen:true,screenCells:42,screenGrid:.85,screenScan:.3,
  particles:72,particleSize:.06,particleLife:.65,particleSpeed:5,spread:2.7,rise:2.7,
  gravity:-5,turbulence:6,stretch:1,particleOpacity:.8,dither:'Dither',ditherAmount:1,ditherSize:2,
  field:true,fieldHeight:2,fieldOpacity:.3,fieldPulse:.6,fieldFade:4,fieldSpreadX:1.2,fieldSpreadZ:.65,
  fieldTurbulence:.75,fieldNoiseScale:1.2,fieldNoiseSpeed:.4,fieldDither:'Dither',fieldDitherAmount:.45,fieldDitherSize:2,
  distortion:true,distortionStrength:.6,
});
