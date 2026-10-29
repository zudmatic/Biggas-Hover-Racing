const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));

// Four quiet looping sources share the existing noise buffer and master mute.
// The echo has a gated return, so pausing never leaves a reverb tail playing.
export function createBiggasAmbience(context,master,engine,noise){
  const nodes=[],sources=[],bus=context.createGain();bus.gain.value=0;bus.connect(master);nodes.push(bus);
  const smooth=(param,value,time=.18)=>param.setTargetAtTime(value,context.currentTime,time);
  function layer(type,frequency,q){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=noise;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=0;
    source.connect(filter);filter.connect(gain);gain.connect(bus);source.start();sources.push(source);nodes.push(source,filter,gain);return {gain,filter};
  }
  const falls=layer('lowpass',1900,.5),wind=layer('bandpass',600,.35),rail=layer('bandpass',320,1.2),motor=context.createOscillator(),motorGain=context.createGain();
  motor.type='triangle';motor.frequency.value=85;motorGain.gain.value=0;motor.connect(motorGain);motorGain.connect(bus);motor.start();sources.push(motor);nodes.push(motor,motorGain);
  const delay=context.createDelay(.3),feedback=context.createGain(),echo=context.createGain(),filter=context.createBiquadFilter();
  delay.delayTime.value=.115;feedback.gain.value=.24;filter.type='lowpass';filter.frequency.value=1800;echo.gain.value=0;
  engine.connect(delay);delay.connect(filter);filter.connect(feedback);feedback.connect(delay);filter.connect(echo);echo.connect(bus);nodes.push(delay,feedback,echo,filter);
  let levels={falls:0,wind:0,train:0,gallery:0};
  return {
    get levels(){return {...levels};},
    setActive(active){smooth(bus.gain,active?1:0,.025);},
    update(environment={}){
      levels={falls:clamp(environment.falls??0),wind:clamp(environment.wind??0),train:clamp(environment.train??0),gallery:clamp(environment.gallery??0)};
      smooth(falls.gain.gain,levels.falls*.24);smooth(falls.filter.frequency,900+levels.falls*1500);
      smooth(wind.gain.gain,levels.wind*.18);smooth(wind.filter.frequency,450+levels.wind*500);
      smooth(rail.gain.gain,levels.train*.08);smooth(motorGain.gain,levels.train*.075);smooth(motor.frequency,75+clamp(environment.trainApproach??0,-1,1)*12);
      smooth(echo.gain,levels.gallery*.22);
    },
    dispose(){for(const source of sources){try{source.stop();}catch{}}engine.disconnect(delay);nodes.forEach(node=>node.disconnect());},
  };
}
