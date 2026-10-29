import {shipLiveryChoice} from '@/content/vehicles/zudoneta-037/liveries';
import {ACESFilmicToneMapping, Color, Fog, PCFShadowMap, PerspectiveCamera, Scene} from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import {audio} from '@/audio/audio-system';
import {GameRenderer, isWebGPUBackend} from '@/render/game-renderer';
import {AssetLoader} from '@/core/assets/asset-loader';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import {isDrivingPhase, type GamePhase} from '@/core/types';
import {pilotChoice, pilotQuery} from '@/content/characters/selection';
import {characters} from '@/content/characters';
import {vehicles} from '@/content/vehicles';
import {Vehicle} from '@/content/vehicles/vehicle';
import {EYE_CLOSED} from '@/content/vehicles/ship-eyes';
import {tracks} from '@/content/tracks';
import type {Track} from '@/content/tracks/track';
import {DriftFxControls} from '@/fx/drift/drift-fx-dials';
import {QualityController, type QualitySettings} from '@/render/quality-controller';
import type {FlightGraphics} from '@/render/flight-graphics';
import {TrackLighting} from '@/render/lighting/track-lighting';
import {createCircuitSky, SpeedAtmosphere} from '@/render/sky/atmosphere';
import type {HoverState} from '@/sim/hover-state';
import {BoostPads} from './boost-pads/boost-pads';
import {CameraRig} from './camera/camera-rig';
import {RaceDebug} from './debug/race-debug';
import {Hud} from './hud/hud';
import {RaceScreen} from './hud/race-screen';
import {RaceInput, type RaceAction} from './input/race-input';
import {BULLDOG_INTRO_DURATION, INTRO_IGNITION, IntroCamera, introEyes, BulldogIntroDriver, introLift} from './intro/bulldog-intro';
import {IntroOverlay} from './intro/bulldog-intro-overlay';
import {FixedStepLoop} from './loop/fixed-step-loop';
import {ModelScaleDials, scaledHull} from './model-scale';
import {OilGameplay} from './oil/oil-gameplay';
import {Racer} from './race/racer';
import {SoundControl} from '@/ui/sound-control/sound-control';

/** Hands the lobby's paper wipe over to the race once the track is drawn. */
export interface EntryTransition {
  readonly animated: boolean;
  mount(): void;
  progress(value: number): void;
  reveal(): Promise<void>;
  cancel(): void;
}

type FlightGraphicsModule = typeof import('@/render/flight-graphics');
type Oil = OilGameplay;
type Graphics = FlightGraphics;

interface IntroPlayback {
  time: number;
  eyes: boolean;
  ignited: boolean;
  finishing: boolean;
  headlights: boolean;
  camera: IntroCamera;
  overlay: IntroOverlay;
}

const DEFAULT_MODEL_SCALE = 0.75;

/**
 * One race on one track: owns the renderer, scene, player racer, cameras,
 * HUD, input, track features (oil, boost pads), cinematics and the fixed-step
 * loop. Created from the lobby with `RaceSession.start()`.
 */
export class RaceSession implements Disposable {
  private readonly query = new URLSearchParams(location.search);
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly mobile = matchMedia('(max-width:760px), (pointer:coarse)').matches;
  private readonly resources = new DisposableGroup();
  private readonly trackConfig = tracks.resolve(this.query.get('map'));
  private readonly vehicleConfig = vehicles.resolve(this.query.get('vehicle'));
  private readonly choice = pilotChoice(this.query);
  private readonly livery = shipLiveryChoice(this.query);
  private readonly naturalLook = this.trackConfig.look === 'natural';
  private readonly artReview = import.meta.env.DEV && this.trackConfig.id === 'desert-valley' && this.query.has('artView');
  private readonly screen: RaceScreen;
  private readonly hud: Hud;
  private readonly input: RaceInput;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 7000);
  private readonly cameraRig: CameraRig;
  private readonly lighting;
  private readonly sky;
  private readonly atmosphere;
  private readonly quality;
  private readonly soundControl: SoundControl;
  private readonly scaleControl;
  private renderer!: WebGPURenderer;
  private graphicsModule!: FlightGraphicsModule;
  private graphics: Graphics | null = null;
  private track!: Track;
  private player!: Racer;
  private vehicle: Vehicle | null = null;
  private oil: Oil | null = null;
  private boostPads: BoostPads | null = null;
  private fxControls: DriftFxControls | null = null;
  private loop: FixedStepLoop | null = null;
  private debug: RaceDebug | null = null;
  private perfReview: {sample(frameMs: number, workMs: number): void; trainRunning: boolean; dispose(): void} | null = null;
  private intro: IntroPlayback | null = null;
  private phase: GamePhase = 'loading';
  private comic: boolean;
  private modelScale = DEFAULT_MODEL_SCALE;
  private simulationTime = 0;
  private worldTime = 0;
  private shadowElapsed = Infinity;
  private shadowInterval = 1 / 30;
  private lastPilotFrame = -1;
  private disposed = false;

  static async start({entryTransition}: {entryTransition?: EntryTransition} = {}): Promise<RaceSession | null> {
    const session = new RaceSession(entryTransition);
    return (await session.load()) ? session : null;
  }

  private constructor(private readonly entryTransition?: EntryTransition) {
    const {query, trackConfig, vehicleConfig, choice} = this;
    const pilot = characters.resolve(choice.pilot);
    this.comic = query.has('comic') ? query.get('comic') !== '0' : !this.naturalLook;
    audio.music.setRaceTrack(this.trackConfig.music);
    document.title = `Biggas Hover Racing · ${trackConfig.name} ${trackConfig.number}`;
    const canonical = new URL(location.href);
    canonical.searchParams.set('map', trackConfig.id);
    canonical.searchParams.set('vehicle', vehicleConfig.id);
    canonical.searchParams.delete('seed');
    canonical.searchParams.delete('mode');
    history.replaceState(null, '', canonical);

    const base = import.meta.env.BASE_URL;
    const team = `${pilotQuery(choice)}&livery=${this.livery}`;
    this.screen = new RaceScreen({
      pilotName: pilot.name,
      vehicleId: vehicleConfig.id,
      vehicleName: vehicleConfig.name,
      trackName: trackConfig.name,
      trackNumber: trackConfig.number,
      teamHref: `${base}?map=${trackConfig.id}&vehicle=${vehicleConfig.id}&${team}`,
      mapSelectionHref: `${base}?selection=map&map=${trackConfig.id}&vehicle=${vehicleConfig.id}&${team}`,
      homeHref: base,
      hangarHref: `${base}spaceship.html?vehicle=${vehicleConfig.id}&${team}`,
      comic: this.comic,
    });
    const {app} = this.screen;
    app.dataset.entryMotion = String(entryTransition?.animated ?? false);
    Object.assign(app.dataset, {
      map: trackConfig.id,
      pilot: choice.pilot,
      palette: choice.palette,
      hat: choice.hat,
      livery: vehicleConfig.paint ? this.livery : 'original',
      vehicle: vehicleConfig.id,
    });
    entryTransition?.mount();

    this.hud = new Hud(this.screen);
    this.input = this.resources.add(
      new RaceInput({
        root: app,
        isDriving: () => this.phase === 'flying',
        isIntro: () => this.phase === 'intro',
        onGesture: () => audio.unlock(),
        onAction: (action) => this.action(action),
        reducedMotion: () => this.reduced.matches,
      }),
    );
    this.scene.fog = new Fog(0xb6c6bd, 220, 1100);
    this.scene.background = new Color(0xb6c6bd);
    this.scene.matrixWorldAutoUpdate = false;
    this.lighting = new TrackLighting(this.scene, {
      mobile: this.mobile,
      headlightMounts: vehicleConfig.lights.headlights,
      underglow: vehicleConfig.lights.underglow,
    });
    this.sky = createCircuitSky(this.scene, {mobile: this.mobile, map: trackConfig.id});
    this.atmosphere = new SpeedAtmosphere(this.scene, {mobile: this.mobile});
    this.quality = new QualityController({
      width: innerWidth,
      height: innerHeight,
      pixelRatio: devicePixelRatio,
      mobile: this.mobile,
      onChange: (settings) => this.applyQuality(settings),
    });
    this.cameraRig = this.resources.add(
      new CameraRig(this.camera, {
        element: this.screen.canvas,
        klipp: query.get('camera') !== 'actual',
        canOrbit: () => this.phase === 'flying' || this.phase === 'paused',
        lookingBack: () => !!this.oil?.lookingBack,
      }),
    );
    this.scaleControl = new ModelScaleDials(
      (scale: number) => this.setModelScale(scale),
      () => this.input.clear(),
    );
    this.soundControl = this.resources.add(new SoundControl(this.screen.get('.sound-control'), {onOpen: () => this.input.clear()}));
    this.bindMenu();
  }

  get currentPhase(): GamePhase {
    return this.phase;
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  private async load(): Promise<boolean> {
    const {screen, entryTransition} = this;
    try {
      this.graphicsModule = await import('@/render/flight-graphics');
      this.renderer = (await GameRenderer.create(screen.canvas)).renderer;
    } catch (error) {
      console.error(error);
      this.fail('No se pudo iniciar la vista 3D.');
      return false;
    }
    const {renderer} = this;
    AssetLoader.shared.configure(renderer);
    screen.app.dataset.backend = isWebGPUBackend(renderer) ? 'WebGPU' : 'WebGL2';
    renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.trackConfig.id === 'desert-valley' ? 0.98 : 1.05;
    renderer.info.autoReset = false;
    this.applyQuality(this.quality.settings);
    this.lighting.sun.shadow.autoUpdate = false;
    this.bindWindow();

    try {
      const started = performance.now();
      const [vehicle] = await Promise.all([
        Vehicle.load(this.vehicleConfig, {
          character: this.choice.pilot,
          palette: this.choice.palette,
          hat: this.choice.hat,
          livery: this.livery,
          exhaust: false,
        }),
        this.loadTrack(),
      ]);
      this.vehicle = vehicle;
      screen.app.dataset.worldReadyMs = String(Math.round(performance.now() - started));
      vehicle.root.scale.setScalar(this.modelScale);
      vehicle.setHeadlights(this.lighting.headlightsEnabled);
      this.scene.add(vehicle.root);
      this.syncVehicle();
      this.updateCamera(1, true);
      const {track, scene} = this;
      this.oil = await OilGameplay.load({
        scene,
        landscape: track.landscape,
        surfaceHeight: track.surfaceHeight,
        app: screen.app,
        clearInput: () => this.input.clear(),
        onPrepare: (botDrops?: boolean) => this.prepareOilTest(botDrops),
        onNotice: (text: string) => screen.notice(text),
      });
      this.oil.reset(this.player.state, true);
      this.hud.minimap.layers.push((context, half) => this.oil?.drawMap(context, half));
      if (this.trackConfig.id === 'mario-raceway') {
        this.boostPads = await BoostPads.load({
          scene,
          landscape: track.landscape,
          surfaceHeight: track.surfaceHeight,
          onActivate: () => screen.notice('¡Placa turbo!'),
        });
      }
      this.graphics = await this.graphicsModule.FlightGraphics.create(renderer, scene, this.camera, vehicle, this.oil, {
        naturalDesert: this.naturalLook,
        naturalForest: this.trackConfig.id === 'biggas-city',
        boostPads: this.boostPads,
      });
      this.graphics.setQuality(this.quality.settings);
      if (!this.artReview) this.prepareIntro();
      this.setPhase('loading');
      screen.loader.hidden = !!entryTransition;
      screen.setLoadStatus('Preparando gráficos…');
      this.lighting.update(this.player.state, this.worldTime, {reducedMotion: this.reduced.matches});
      this.sky.update(this.camera, 0, {reducedMotion: this.reduced.matches});
      this.updateMatrices();
      const compileStarted = performance.now();
      await track.warmup({
        scene,
        render: () => this.graphics!.render({state: this.player.state, phase: 'loading', comic: this.comic, reduced: this.reduced.matches}),
      });
      screen.app.dataset.compileMs = String(Math.round(performance.now() - compileStarted));
      screen.loader.hidden = true;
      if (entryTransition) {
        // Draw the track before revealing it; driving starts once the cover is gone.
        this.setPhase('loading');
        if (this.intro) this.intro.camera.update(0, this.player.state, this.modelScale);
        else this.updateCamera(1, true);
        this.sky.update(this.camera, 0, {reducedMotion: this.reduced.matches});
        this.updateMatrices();
        await this.graphics.render({state: this.player.state, phase: this.phase, comic: this.comic, reduced: this.reduced.matches});
        await entryTransition.reveal();
      }
      screen.app.dataset.ready = 'true';
      if (this.intro) this.playIntro();
      else {
        this.start();
        if (document.hidden) this.pause();
      }
      if (this.artReview) await this.mountArtReview();
    } catch (error) {
      console.error(error);
      this.fail('No se pudo cargar el simulador.');
      return false;
    }
    if (import.meta.env.DEV) await this.mountDebug();
    this.loop = this.resources.add(
      new FixedStepLoop(renderer, {
        fixedUpdate: (dt) => this.fixedUpdate(dt),
        frame: (dt, alpha, raw) => this.frame(dt, alpha, raw),
        onError: (error) => {
          console.error(error);
          this.input.clear();
          this.fail('Se interrumpió la vista 3D.');
        },
      }),
    );
    this.loop.start();
    return true;
  }

  private async loadTrack(): Promise<void> {
    const {screen, renderer} = this;
    const track = await this.trackConfig.load({
      mobile: this.mobile,
      underglow: this.vehicleConfig.lights.underglow,
      fxMaterialFactory: this.graphicsModule.createSmokeMaterial,
      anisotropy: Math.min(4, renderer.getMaxAnisotropy()),
      onProgress: (value: number) => {
        screen.setProgress(value);
        this.entryTransition?.progress(value);
      },
    });
    this.track = track;
    this.scene.add(track.root);
    this.lighting.setTrack(track.landscape);
    track.textures.applyRoot(this.lighting.root);
    await track.initWater?.(this.lighting.sun);
    screen.app.dataset.water = track.water ? 'animated' : 'none';
    this.fxControls = new DriftFxControls(track.fx, (message: string) => {
      screen.notice(message);
      if (this.phase === 'flying') screen.canvas.focus({preventScroll: true});
    });
    this.player = new Racer(
      'p1',
      {character: this.choice.pilot, vehicle: this.vehicleConfig.id, palette: this.choice.palette, hat: this.choice.hat, livery: this.livery},
      track.landscape,
      track,
      this.input,
      (state) => this.decorate(state),
    );
    screen.setText(screen.get('#flight-seed'), `${Math.round(track.landscape.length)} M · HOVER`);
    this.hud.minimap.build(track.landscape);
    this.resetFlight();
    this.updateCamera(1, true);
  }

  private async mountDebug(): Promise<void> {
    const {renderer, track} = this;
    const session = this;
    this.debug = new RaceDebug({
      get backend() {
        return isWebGPUBackend(renderer) ? 'WebGPU' : 'WebGL2';
      },
      get phase() {
        return session.phase;
      },
      get look() {
        if (!session.comic && session.trackConfig.id === 'biggas-city') return 'forest-anime';
        return session.naturalLook && !session.comic ? 'sunlit' : 'comic';
      },
      get state() {
        return session.player.state;
      },
      get viewport(): [number, number] {
        return [innerWidth, innerHeight];
      },
      get pixelRatio() {
        return renderer.getPixelRatio();
      },
      get quality() {
        return session.quality.settings;
      },
      renderInfo: renderer.info as unknown as {render: Record<string, number>; memory: Record<string, number>},
      lod: track.lod,
      teleport: (x, z, yaw) => this.teleport(x, z, yaw),
      overview: () => {
        this.cameraRig.mode = 3;
        this.camera.position.set(575, 570, 650);
        this.camera.lookAt(0, 15, 0);
        this.camera.updateMatrixWorld();
      },
    });
    if (this.naturalLook && this.query.has('perfReview') && track.train && this.graphics) {
      this.applyQuality({...this.quality.settings, mode: 'high', pixelRatio: 1, scale: 1, samples: 4, lite: false, shadowInterval: 1 / 30});
      const {mountDesertPerformanceReview} = await import('@/tools/desert-review/performance-review');
      this.perfReview = mountDesertPerformanceReview({
        app: this.screen.app,
        renderer,
        benchmark: this.debug,
        graphics: this.graphics,
        world: {train: track.train},
      });
    }
  }

  private async mountArtReview(): Promise<void> {
    const {track, vehicle} = this;
    if (!track.lod || !vehicle) return;
    this.cameraRig.mode = 3;
    const {mountDesertArtReview} = await import('@/tools/desert-review/art-review');
    mountDesertArtReview({
      key: this.query.get('artView'),
      world: {surfaceHeight: track.surfaceHeight, lod: track.lod},
      state: this.player.state,
      camera: this.camera,
      vehicle,
      app: this.screen.app,
    });
  }

  // ─── Phases ─────────────────────────────────────────────────────────────

  private setPhase(next: GamePhase): void {
    this.scaleControl.setVisible(next === 'flying' || next === 'paused');
    const previous = this.phase;
    this.phase = next;
    audio.setPhase(next);
    if (next !== 'flying' || previous === 'paused') this.input.clear();
    if (previous !== next) this.quality.reset();
    this.screen.showPhase(next);
    if (next === 'flying') {
      this.soundControl.close();
      this.screen.canvas.focus({preventScroll: true});
    }
    if (next === 'paused') {
      this.hud.invalidate();
      this.updateHud();
    }
  }

  private start(): void {
    audio.unlock();
    this.resetFlight();
    this.screen.hideNotice();
    this.setPhase('flying');
    this.updateCamera(1, true);
  }

  private pause(): void {
    if (this.phase === 'flying') this.setPhase('paused');
    else if (this.phase === 'paused') {
      audio.unlock();
      this.setPhase('flying');
    }
  }

  private resetFlight(): void {
    this.boostPads?.reset();
    this.graphics?.reset();
    this.player.reset();
    this.simulationTime = 0;
    this.loop?.resetAccumulator();
    this.track.reset();
    this.oil?.reset(this.player.state, true);
    this.syncVehicle();
    this.updateCamera(1, true);
    this.hud.invalidate();
  }

  private recover(manual = false): void {
    this.track.fx.reset();
    this.track.resetWaterFx?.();
    this.graphics?.reset();
    this.oil?.cancelPour();
    audio.cue('recover');
    this.player.recover();
    this.screen.notice(manual ? 'Nave recuperada' : 'Fuera de pista · nave recuperada');
    this.syncVehicle();
    this.updateCamera(1, true);
  }

  private teleport(x: number, z: number, yaw = 0): void {
    const {state} = this.player;
    Object.assign(state, {
      x,
      z,
      y: (this.track.surfaceHeight(x, z) ?? 0) + 0.65,
      yaw,
      speed: 0,
      throttle: 0,
      vx: 0,
      vz: 0,
      hoverVelocity: 0,
      airborne: false,
    });
    this.input.clear();
    this.syncVehicle();
    this.updateCamera(1, true);
    this.track.lod?.update(state, 0, true);
  }

  private action(action: RaceAction): void {
    switch (action) {
      case 'pause':
        this.pause();
        break;
      case 'skipIntro':
        void this.finishIntro();
        break;
      case 'toggleSound':
        this.soundControl.toggleSound();
        break;
      case 'toggleHeadlights':
        this.toggleHeadlights();
        break;
      case 'changeCamera':
        if (this.phase !== 'loading') this.changeCamera();
        break;
      case 'useItem':
        this.oil?.use();
        break;
      case 'recover':
        this.recover(true);
        break;
    }
  }

  private changeCamera(): void {
    const label = this.cameraRig.cycle();
    this.screen.setText(this.screen.get('#flight-camera-state'), label);
    this.screen.notice(`Cámara ${label.toLowerCase()}`);
    if (this.reduced.matches) this.updateCamera(1, true);
  }

  private toggleHeadlights(): void {
    const {lighting} = this;
    lighting.setHeadlights(!lighting.headlightsEnabled);
    this.vehicle?.setHeadlights(lighting.headlightsEnabled);
    this.screen.notice(lighting.headlightsEnabled ? 'Faros encendidos' : 'Faros apagados');
  }

  private prepareOilTest(botDrops = false): void {
    const {oil, track, player, screen} = this;
    if (this.phase !== 'flying' || !oil) return;
    this.resetFlight();
    const {landscape} = track;
    const startDistance = landscape.roadAt(landscape.spawn.x, landscape.spawn.z).distance;
    const road = landscape.atDistance(startDistance + 30);
    const speed = oil.sim.config.botSpeed + (botDrops ? 8 : 0);
    Object.assign(player.state, {
      x: road.x,
      y: (track.surfaceHeight(road.x, road.z) ?? road.y) + 0.65,
      z: road.z,
      yaw: Math.atan2(road.nx, road.nz),
      pitch: Math.atan(road.grade),
      speed,
      throttle: speed,
      vx: road.nx * speed,
      vz: road.nz * speed,
    });
    player.gateIndex = 1;
    this.input.clear();
    oil.prepare(player.state, botDrops);
    this.syncVehicle();
    this.updateCamera(1, true);
    screen.canvas.focus({preventScroll: true});
    screen.notice(botDrops ? 'El bot vierte aceite · atravesá la estela' : 'Prueba lista · Q para dejar aceite al bot');
  }

  // ─── Bulldog cinematic ──────────────────────────────────────────────────

  /** Bulldog 039 only: a skippable cinematic on the real track before free driving. */
  private prepareIntro(): void {
    const {vehicleConfig, reduced, query, vehicle, track} = this;
    if (vehicleConfig.id !== '039' || reduced.matches || query.get('intro') === '0' || !vehicle) return;
    const camera = new IntroCamera(this.camera, {
      landscape: track.landscape,
      surfaceHeight: track.surfaceHeight,
      clipCamera: track.clipCamera,
    });
    const overlay = new IntroOverlay(this.screen.app, {onSkip: () => void this.finishIntro()});
    this.intro = {time: 0, eyes: false, ignited: false, finishing: false, headlights: this.lighting.headlightsEnabled, camera, overlay};
    // Parked on the grid, asleep, until the engine catches.
    vehicle.root.position.y += introLift(0) * this.modelScale;
    vehicle.eyes?.hold(EYE_CLOSED);
    overlay.setShot(camera.update(0, this.player.state, this.modelScale));
    const driver = new BulldogIntroDriver(track.landscape);
    this.player.override = {
      sample: (state) => {
        driver.time = this.intro?.time ?? 0;
        return driver.sample(state);
      },
    };
  }

  private playIntro(): void {
    audio.unlock();
    this.setPhase('intro');
  }

  private updateIntro(dt: number, pose: HoverState): void {
    const {intro, vehicle, lighting} = this;
    if (!intro || !vehicle) return;
    if (!intro.finishing) intro.time += dt;
    // The eyes are the headlamps: blink them awake, as if the bulldog opened them.
    const eyes = introEyes(intro.time);
    if (eyes !== intro.eyes) {
      intro.eyes = eyes;
      lighting.setHeadlights(eyes);
      vehicle.setHeadlights(eyes);
      vehicle.eyes?.hold(eyes ? 1 : EYE_CLOSED);
    }
    if (!intro.ignited && intro.time >= INTRO_IGNITION) {
      intro.ignited = true;
      audio.cue('ignition');
    }
    vehicle.root.position.y += introLift(intro.time) * this.modelScale;
    intro.overlay.setShot(intro.camera.update(intro.time, pose, this.modelScale));
    if (intro.time >= BULLDOG_INTRO_DURATION) void this.finishIntro();
  }

  private async finishIntro(): Promise<void> {
    const {intro, vehicle} = this;
    if (!intro || intro.finishing) return;
    intro.finishing = true;
    await intro.overlay.cover();
    this.lighting.setHeadlights(intro.headlights);
    vehicle?.setHeadlights(intro.headlights);
    vehicle?.eyes?.hold(null);
    this.intro = null;
    this.player.override = null;
    this.start();
    await intro.overlay.reveal();
  }

  // ─── Simulation ─────────────────────────────────────────────────────────

  private fixedUpdate(dt: number): void {
    if (this.artReview) {
      if (this.perfReview?.trainRunning) this.track.train?.step(dt);
      return;
    }
    if (!isDrivingPhase(this.phase)) return;
    const {player, oil, boostPads} = this;
    const state = player.state;
    player.interpolator.capture(state);
    this.simulationTime += dt;
    const impactSerial = state.impactSerial;
    oil?.beforeStep(state, dt);
    const previous = player.integrate(dt);
    if (state.impactSerial !== impactSerial) audio.cue('impact', state.impact);
    if (state.recoverNeeded) {
      this.recover(false);
      return;
    }
    oil?.step(dt, state, previous);
    boostPads?.step(dt, state, previous);
    player.trackProgress(previous);
  }

  private frame(dt: number, alpha: number, rawDelta: number): void {
    if (this.disposed) return;
    const started = performance.now();
    const {phase, player, renderer, track, lighting, reduced} = this;
    const hidden = document.hidden || phase === 'loading';
    this.loop!.simulationPaused = hidden;
    if (hidden) return;
    renderer.info.reset();
    if (phase === 'flying' && !this.perfReview) this.quality.sample(rawDelta * 1000);
    audio.updateEngine(player.state);
    const driving = isDrivingPhase(phase);
    const pose = driving ? player.pose(alpha) : player.state;
    this.syncVehicle(pose);
    if (phase === 'intro') this.updateIntro(dt, pose);
    else this.updateCamera(dt, false, pose);
    const pilotFrame = Math.floor(this.simulationTime * 24);
    if (pilotFrame !== this.lastPilotFrame) {
      this.vehicle?.update(pilotFrame / 24, player.state.speed, player.state.boosting, reduced.matches, pose);
      this.lastPilotFrame = pilotFrame;
    }
    if (phase !== 'paused') this.worldTime += dt;
    track.update(this.worldTime, reduced.matches, {
      state: player.state,
      phase,
      night: lighting.night,
      camera: this.camera,
      shadowLight: lighting.sun,
      scale: this.modelScale,
      dt: driving ? dt : 0,
    });
    lighting.update(player.state, this.worldTime, {dt, reducedMotion: reduced.matches, paused: phase === 'paused'});
    this.sky.update(this.camera, this.worldTime, {night: lighting.night, dt, reducedMotion: reduced.matches});
    this.atmosphere.update(this.camera, player.state, this.simulationTime, {dt, phase, reducedMotion: reduced.matches});
    this.shadowElapsed += dt;
    if (this.shadowElapsed >= this.shadowInterval) {
      lighting.sun.shadow.needsUpdate = true;
      this.shadowElapsed = 0;
    }
    this.oil?.update(player.state, this.camera, phase, this.modelScale, reduced.matches);
    this.boostPads?.update(driving ? dt : 0, reduced.matches);
    this.updateMatrices();
    audio.updateListener(this.camera);
    this.updateHud();
    this.screen.update(performance.now());
    void this.graphics?.render({dt, state: player.state, phase, comic: this.comic, reduced: reduced.matches});
    this.debug?.sample(rawDelta * 1000);
    this.perfReview?.sample(rawDelta * 1000, performance.now() - started);
  }

  /** The scene doesn't auto-update matrices; refresh once per frame. */
  private updateMatrices(): void {
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
  }

  private syncVehicle(pose: HoverState = this.player?.state): void {
    const {vehicle} = this;
    if (!vehicle || !pose) return;
    vehicle.root.position.set(pose.x, pose.y, pose.z);
    vehicle.root.rotation.set(-pose.pitch, pose.yaw, this.reduced.matches ? 0 : pose.roll, 'YXZ');
  }

  private updateCamera(dt: number, snap = false, pose: HoverState = this.player?.state): void {
    if (!pose || !this.track) return;
    if (snap) this.player.interpolator.reset(this.player.state);
    this.cameraRig.update(pose, dt, {world: this.track, snap, reducedMotion: this.reduced.matches, time: this.simulationTime});
  }

  private updateHud(): void {
    const {player, track, phase} = this;
    const state = player.state;
    const surface = track.surfaceHeight(state.x, state.z) ?? track.landscape.height(state.x, state.z);
    this.hud.update(performance.now() / 1000, state, {phase, altitude: state.y - surface, fps: this.quality.fps});
  }

  // ─── Settings ───────────────────────────────────────────────────────────

  private decorate(state: HoverState): HoverState {
    state.hull = scaledHull(this.vehicleConfig, this.modelScale);
    state.modelScale = this.modelScale;
    return state;
  }

  private setModelScale(scale: number): void {
    this.modelScale = scale;
    this.screen.app.dataset.modelScale = scale.toFixed(2);
    if (this.player) this.decorate(this.player.state);
    this.vehicle?.root.scale.setScalar(scale);
    this.lighting.sun.shadow.needsUpdate = true;
  }

  private applyQuality(settings: QualitySettings): void {
    if (!this.renderer) return;
    this.renderer.setPixelRatio(settings.pixelRatio);
    this.graphics?.setQuality(settings);
    this.screen.app.dataset.quality = settings.mode;
    this.screen.app.dataset.renderScale = settings.scale.toFixed(2);
    this.shadowInterval = settings.shadowInterval;
    this.lighting.sun.shadow.needsUpdate = true;
  }

  // ─── DOM wiring ─────────────────────────────────────────────────────────

  private bindMenu(): void {
    const {screen, resources} = this;
    for (const link of document.querySelectorAll<HTMLAnchorElement>('.flight-team-link, #flight-map-selection')) {
      resources.listen(link, 'click', () => {
        const url = new URL(link.href);
        url.searchParams.set('comic', this.comic ? '1' : '0');
        if (this.query.get('renderer') === 'webgl2') url.searchParams.set('renderer', 'webgl2');
        link.href = url.href;
      });
    }
    const options = screen.get<HTMLDetailsElement>('.flight-options');
    resources.listen(options, 'toggle', () => {
      if (!options.open) this.soundControl.close();
    });
    const quality = screen.get<HTMLSelectElement>('#flight-quality');
    quality.value = this.quality.mode;
    resources.listen(quality, 'change', () => this.quality.setMode(quality.value));
    screen.get<HTMLButtonElement>('#flight-resume').onclick = () => this.pause();
    screen.get<HTMLButtonElement>('#flight-restart').onclick = () => this.start();
    screen.get<HTMLButtonElement>('#flight-camera').onclick = () => this.changeCamera();
    screen.get<HTMLButtonElement>('#flight-light').onclick = (event) => {
      const {lighting} = this;
      lighting.setNight(!lighting.night);
      (event.currentTarget as HTMLElement).setAttribute('aria-pressed', String(lighting.night));
      screen.setText(screen.get('#flight-light-state'), lighting.night ? 'Noche' : 'Día');
    };
    screen.get<HTMLButtonElement>('#flight-comic').onclick = (event) => {
      this.comic = !this.comic;
      (event.currentTarget as HTMLElement).setAttribute('aria-pressed', String(this.comic));
      screen.setText(screen.get('#flight-comic-state'), this.comic ? 'Activado' : 'Desactivado');
    };
  }

  private bindWindow(): void {
    const {resources, screen} = this;
    resources.listen(screen.canvas, 'pointerdown', () => audio.unlock());
    const suspend = () => {
      audio.setPhase('paused');
      this.input.clear();
      if (this.phase === 'flying') this.pause();
    };
    resources.listen(window, 'blur', suspend);
    resources.listen(document, 'visibilitychange', () => {
      if (document.hidden) suspend();
    });
    resources.listen(window, 'resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.quality.resize(innerWidth, innerHeight, devicePixelRatio);
    });
    resources.listen(this.reduced, 'change', () => {
      if (this.player) this.updateCamera(1, true);
    });
    for (const type of ['webglcontextlost', 'graphicslost']) {
      resources.listen(screen.canvas, type, (event) => {
        event.preventDefault();
        this.loop?.stop();
        audio.setPhase('paused');
        this.input.clear();
        this.fail('Se interrumpió la vista 3D.');
      });
    }
    resources.listen(window, 'pagehide', () => this.dispose(), {once: true});
  }

  private fail(message: string): void {
    (this.entryTransition as (EntryTransition & {cancel(): void}) | undefined)?.cancel();
    audio.setPhase('loading');
    this.screen.fail(message);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop?.stop();
    this.perfReview?.dispose();
    this.debug?.dispose();
    this.boostPads?.dispose();
    this.graphics?.dispose();
    this.fxControls?.dispose();
    this.oil?.dispose();
    this.scaleControl.dispose();
    this.resources.dispose();
    this.track?.dispose();
    this.lighting.dispose();
    this.sky.dispose();
    this.atmosphere.dispose();
    this.vehicle?.dispose();
    this.renderer?.dispose();
  }
}

declare global {
  interface Window {
    __desertBenchmark?: unknown;
  }
}
