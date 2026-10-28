/**
 * A mixer channel: one gain stage with smoothed level changes, mute and
 * ducking. Buses nest (`connect(otherBus)`), so a mix is a small tree.
 */
export class AudioBus {
  readonly input: GainNode;
  private level: number;
  private muted = false;
  private duckAmount = 0;

  constructor(
    readonly context: AudioContext,
    readonly name: string,
    level = 1,
  ) {
    this.level = level;
    this.input = context.createGain();
    this.input.gain.value = level;
  }

  connect(destination: AudioBus | AudioNode): this {
    this.input.connect(destination instanceof AudioBus ? destination.input : destination);
    return this;
  }

  get volume(): number {
    return this.level;
  }

  /** Sets the bus level (0–1+). `smoothing` is the time constant in seconds. */
  setVolume(value: number, smoothing = 0.05): void {
    this.level = Math.max(0, value);
    this.apply(smoothing);
  }

  setMuted(muted: boolean, smoothing = 0.035): void {
    this.muted = muted;
    this.apply(smoothing);
  }

  /**
   * Temporarily lowers the bus, e.g. music under a voice line.
   * `amount` 0 = no ducking, 1 = silent.
   */
  duck(amount: number, smoothing = 0.12): void {
    this.duckAmount = Math.min(1, Math.max(0, amount));
    this.apply(smoothing);
  }

  get output(): number {
    return this.muted ? 0 : this.level * (1 - this.duckAmount);
  }

  dispose(): void {
    this.input.disconnect();
  }

  private apply(smoothing: number): void {
    const param = this.input.gain;
    const now = this.context.currentTime;
    if (smoothing <= 0) param.setValueAtTime(this.output, now);
    else param.setTargetAtTime(this.output, now, smoothing);
  }
}
