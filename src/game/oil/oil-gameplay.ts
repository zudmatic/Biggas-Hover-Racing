import {
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import {attribute} from 'three/tsl';
import {AssetLoader} from '@/core/assets/asset-loader';
import type {Disposable} from '@/core/disposable';
import type {GamePhase} from '@/core/types';
import {Vehicle} from '@/content/vehicles/vehicle';
import {vehicles} from '@/content/vehicles';
import {createOilMaterial} from '@/fx/oil/oil-material';
import type {SurfaceHeight} from '@/sim/hover-physics';
import {createHoverState, type HoverState, type Position3} from '@/sim/hover-state';
import {HOVER_HEIGHT, type Landscape} from '@/sim/landscape';
import {OilSimulation, clearOilEffect, updateOilResistance} from '@/sim/oil-simulation';
import {OilDials} from './oil-dials';
import {BotLabel, OilPanel} from './oil-panel';
import {OilSlickMesh} from './oil-slick-mesh';

const BARREL_PATH = 'models/items/oil-barrel.glb';
const MARKER_COLOR = 0xffb154;
const MARKER_OIL_COLOR = 0xff643e;

export interface OilGameplayOptions {
  scene: Object3D;
  landscape: Landscape;
  surfaceHeight: SurfaceHeight;
  /** Race UI root (`.flight-app`); hosts the oil card and the bot label. */
  app: HTMLElement;
  /** Releases held driving input when the pointer goes to the card. */
  clearInput: () => void;
  /** Sets up an oil test; `botDrops` makes the bot pour ahead of the player. */
  onPrepare: (botDrops?: boolean) => void;
  onNotice: (text: string) => void;
  /** Slick material; the WebGPU module passes its own. */
  materialFactory?: () => Material;
}

/** Who is pouring the current trail. */
type PourOwner = 'player' | 'bot';

/** Where the trail leaves a racer: behind its position, scaled with the model. */
interface PourEmitter {
  x: number;
  z: number;
  yaw: number;
  modelScale: number;
}

/**
 * Oil barrels and slicks on the track, plus the test bot used to try them:
 * pickups, the pour trail, slowdown on contact, the item card and the
 * 'oil-settings' dials. Visible only while enabled and outside the intro cameo.
 */
export class OilGameplay implements Disposable {
  readonly sim: OilSimulation;
  /** Test bot that follows the centreline at `sim.config.botSpeed`. */
  readonly bot: HoverState;
  readonly botShip: Vehicle;
  private readonly root = new Group();
  private readonly options: OilGameplayOptions;
  private readonly template: Object3D;
  private readonly barrels: Group[];
  private readonly haloGeometry = new TorusGeometry(0.8, 0.065, 4, 20);
  private readonly haloMaterial = new MeshBasicMaterial({color: 0xe7cc83});
  private readonly marker = new Mesh(new ConeGeometry(0.35, 0.7, 4), new MeshBasicMaterial({color: MARKER_COLOR}));
  private readonly slicks: OilSlickMesh;
  private readonly panel: OilPanel;
  private readonly label: BotLabel;
  private readonly dials: OilDials;
  private readonly projected = new Vector3();
  /** Reused pour emitter while the bot pours. */
  private readonly botEmitter: PourEmitter = {x: 0, z: 0, yaw: 0, modelScale: 0.75};
  private pourOwner: PourOwner = 'player';
  private enabled = false;
  private botEnabled = true;
  private lookBack = false;
  private phase: GamePhase = 'loading';
  private scale = 0.75;
  private botDistance = 0;
  private hits = 0;
  private lastContact = false;

  static async load(options: OilGameplayOptions): Promise<OilGameplay> {
    const [barrel, ship] = await Promise.allSettled([
      AssetLoader.shared.gltf(BARREL_PATH),
      Vehicle.load(vehicles.require('037'), {exhaust: false}),
    ]);
    if (barrel.status === 'rejected') {
      if (ship.status === 'fulfilled') ship.value.dispose();
      throw barrel.reason;
    }
    if (ship.status === 'rejected') throw ship.reason;
    return new OilGameplay(barrel.value.scene, ship.value, options);
  }

  constructor(template: Object3D, botShip: Vehicle, options: OilGameplayOptions) {
    const {scene, landscape, surfaceHeight, app} = options;
    this.options = options;
    this.template = template;
    this.botShip = botShip;
    this.root.name = 'Barriles y aceite';
    scene.add(this.root);
    this.sim = new OilSimulation(landscape, surfaceHeight);
    this.bot = createHoverState(landscape);
    this.root.add(botShip.root);
    this.marker.rotation.z = Math.PI;
    this.root.add(this.marker);

    template.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.barrels = this.sim.pickups.map((pickup) => {
      const group = new Group();
      const barrel = template.clone(true);
      barrel.scale.setScalar(0.85);
      group.add(barrel);
      const halo = new Mesh(this.haloGeometry, this.haloMaterial);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -0.12;
      group.add(halo);
      group.position.set(pickup.x, pickup.y + 1, pickup.z);
      this.root.add(group);
      return group;
    });

    // World-space shading keeps overlapping drops visually continuous. A thin-film
    // sheen and broad sky highlight vary with viewing angle, without tiled pixels.
    const material = options.materialFactory ? options.materialFactory() : createOilMaterial(attribute('color', 'vec4').a);
    this.slicks = new OilSlickMesh(material, surfaceHeight);
    this.root.add(this.slicks.mesh);

    const focusDrive = () => app.querySelector<HTMLElement>('.flight-canvas')?.focus({preventScroll: true});
    this.panel = new OilPanel(app, {
      onPointerDown: () => options.clearInput(),
      onUse: () => {
        this.use();
        focusDrive();
      },
      onLook: () => {
        this.lookBack = !this.lookBack;
        this.panel.setLookingBack(this.lookBack);
        focusDrive();
      },
      onPrepare: () => {
        if (this.enabled && this.phase === 'flying') options.onPrepare();
      },
      onBotDrop: () => {
        if (this.enabled && this.phase === 'flying') options.onPrepare(true);
      },
      onBotToggle: (enabled) => {
        this.botEnabled = enabled;
        if (!enabled && this.pourOwner === 'bot') this.sim.cancelPour();
      },
    });
    this.label = new BotLabel(app);
    this.dials = new OilDials(this.sim.config);
  }

  /** True while the player asked to look backwards (oil test). */
  get lookingBack(): boolean {
    return this.enabled && this.lookBack;
  }

  /** Pours the player's barrel, if any. */
  use(): void {
    if (this.enabled && this.phase === 'flying' && this.sim.use()) {
      this.pourOwner = 'player';
      this.options.onNotice('Aceite · dejando estela');
    }
  }

  reset(player: HoverState, active: boolean): void {
    this.pourOwner = 'player';
    this.lookBack = false;
    this.panel.setLookingBack(false);
    this.enabled = active;
    this.root.visible = active;
    this.sim.reset();
    this.hits = 0;
    this.placeBotBehind(player);
    clearOilEffect(player);
  }

  /** Oil test: grants the player a barrel, or makes the bot pour just ahead. */
  prepare(player: HoverState, botDrops = false): void {
    const {sim} = this;
    sim.reset();
    this.hits = 0;
    this.placeBotBehind(player);
    this.pourOwner = botDrops ? 'bot' : 'player';
    if (botDrops) {
      this.botEnabled = true;
      this.panel.setBotEnabled(true);
      this.botDistance = this.options.landscape.roadAt(player.x, player.z).distance + 12;
      this.positionBot();
      sim.startPour();
    } else {
      sim.grant();
    }
  }

  cancelPour(): void {
    this.sim.cancelPour();
  }

  /** Applies oil drag to the player before the physics step. */
  beforeStep(player: HoverState, dt: number): void {
    const {sim} = this;
    updateOilResistance(player, this.enabled && sim.contact(player), dt, sim.config.slowdown, sim.config);
  }

  step(dt: number, player: HoverState, previous: Position3): void {
    if (!this.enabled) return;
    const {sim, bot} = this;
    const hadItem = sim.inventory;
    sim.step(dt, player, previous, this.pourOwner === 'bot' ? this.botPourEmitter() : player);
    if (!hadItem && sim.inventory) this.options.onNotice('Barril recogido · Q para soltar aceite');
    if (!this.botEnabled) return;
    const touching = sim.contact(bot);
    updateOilResistance(bot, touching, dt, sim.config.slowdown, sim.config);
    if (touching && !this.lastContact) {
      this.hits++;
      this.options.onNotice('El bot pisó aceite');
    }
    this.lastContact = touching;
    bot.speed += (sim.config.botSpeed * bot.oilFactor - bot.speed) * (1 - Math.exp(-dt * 5));
    this.botDistance += bot.speed * dt;
    this.positionBot();
  }

  update(player: HoverState, camera: Camera, phase: GamePhase, modelScale: number, reduced: boolean): void {
    const {sim, bot, panel, enabled} = this;
    this.phase = phase;
    this.scale = modelScale;
    const flying = phase === 'flying';
    panel.setHidden(!enabled || !(flying || phase === 'paused'));
    // The Bulldog cameo frames only the hero ship; the test bot rejoins at the grid.
    const cameo = phase === 'intro';
    this.root.visible = enabled && !cameo;
    panel.setCanUse(flying && sim.inventory && !sim.pouring);
    panel.setCanTest(flying);
    panel.setSlot(sim.pouring ? (this.pourOwner === 'bot' ? 'Bot vertiendo…' : 'Vertiendo…') : sim.inventory ? '1 barril' : 'Vacío');
    panel.setHint(
      player.oilContact
        ? 'En aceite · velocidad reducida'
        : sim.pouring
          ? this.pourOwner === 'bot'
            ? 'Seguí al bot y atravesá la estela'
            : 'La estela queda detrás de tu nave'
          : sim.inventory
            ? 'Listo para usar'
            : 'Recogé un barril en la pista',
    );
    panel.setBotStatus(
      !this.botEnabled
        ? 'Bot desactivado'
        : `Bot ${Math.round(bot.speed * 3.6)} km/h · ${bot.oilContact ? 'EN ACEITE' : this.hits ? `${this.hits} impactos` : 'siguiendo pista'}`,
    );
    panel.setPlayerStatus(
      `Tu velocidad: ${Math.round(player.speed * 3.6)} km/h · ${player.oilContact ? 'EN ACEITE' : player.oilFactor < 0.98 ? 'recuperando' : 'normal'}`,
    );
    panel.setSlow(player.oilContact);
    if (!enabled || cameo) {
      this.label.hide();
      return;
    }

    for (let i = 0; i < this.barrels.length; i++) {
      const barrel = this.barrels[i];
      const pickup = sim.pickups[i];
      barrel.visible = pickup.readyAt <= sim.time;
      barrel.position.y = pickup.y + 1 + (reduced ? 0 : Math.sin(sim.time * 2 + i) * 0.12);
      barrel.rotation.y = reduced ? 0 : sim.time * 0.55;
    }
    this.updateBot(camera, reduced);
    this.slicks.update(sim.patches, sim.time);
  }

  /** Bot dot on the minimap (192 px canvas). */
  drawMap(context: CanvasRenderingContext2D, half: number): void {
    if (!this.enabled || !this.botEnabled) return;
    const {bot} = this;
    context.fillStyle = bot.oilContact ? '#ff643e' : '#ffbb65';
    context.beginPath();
    context.arc((bot.x / half + 1) * 96, (bot.z / half + 1) * 96, 3.5, 0, Math.PI * 2);
    context.fill();
  }

  dispose(): void {
    this.dials.dispose();
    this.botShip.dispose();
    this.slicks.dispose();
    this.haloGeometry.dispose();
    this.haloMaterial.dispose();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
    // Barrels are clones of the template: they share its geometry, materials and textures.
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    this.template.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material) as unknown[]) if (isTexture(value)) textures.add(value);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.root.removeFromParent();
    this.panel.remove();
    this.label.remove();
  }

  private updateBot(camera: Camera, reduced: boolean): void {
    const {bot, botShip, marker, scale, sim} = this;
    botShip.root.visible = marker.visible = this.botEnabled;
    botShip.root.scale.setScalar(scale);
    botShip.root.position.set(bot.x, bot.y, bot.z);
    botShip.root.rotation.set(-bot.pitch, bot.yaw, 0, 'YXZ');
    marker.position.set(bot.x, bot.y + 4 * scale, bot.z);
    marker.material.color.setHex(bot.oilContact ? MARKER_OIL_COLOR : MARKER_COLOR);
    botShip.update(sim.time, bot.speed, false, reduced, bot);
    if (!this.botEnabled) {
      this.label.hide();
      return;
    }
    const projected = this.projected.set(bot.x, bot.y + 4.7 * scale, bot.z).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.9) {
      this.label.hide();
      return;
    }
    this.label.show(
      (projected.x * 0.5 + 0.5) * innerWidth,
      (-projected.y * 0.5 + 0.5) * innerHeight,
      bot.oilContact ? 'BOT · EN ACEITE' : 'BOT DE PRUEBA',
    );
  }

  private botPourEmitter(): PourEmitter {
    const {bot, botEmitter} = this;
    botEmitter.x = bot.x;
    botEmitter.z = bot.z;
    botEmitter.yaw = bot.yaw;
    botEmitter.modelScale = this.scale;
    return botEmitter;
  }

  private positionBot(): void {
    const {bot, options} = this;
    const road = options.landscape.atDistance(this.botDistance);
    bot.x = road.x;
    bot.z = road.z;
    bot.y = (options.surfaceHeight(road.x, road.z) ?? road.y) + HOVER_HEIGHT;
    bot.yaw = Math.atan2(road.nx, road.nz);
    bot.pitch = Math.atan(road.grade);
  }

  private placeBotBehind(player: HoverState): void {
    const {bot, sim} = this;
    this.botDistance = this.options.landscape.roadAt(player.x, player.z).distance - 15;
    bot.speed = sim.config.botSpeed;
    clearOilEffect(bot);
    this.lastContact = false;
    this.positionBot();
  }
}

const isTexture = (value: unknown): value is Texture =>
  typeof value === 'object' && value !== null && (value as Partial<Texture>).isTexture === true;
