/** Two seconds of mono white noise, shared by every procedural layer. */
export function createNoiseBuffer(context: BaseAudioContext, seconds = 2): AudioBuffer {
  const buffer = context.createBuffer(1, Math.round(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Smoothly moves an AudioParam toward `value` (time constant in seconds). */
export function glide(param: AudioParam, value: number, context: BaseAudioContext, time = 0.08): void {
  param.setTargetAtTime(value, context.currentTime, time);
}
