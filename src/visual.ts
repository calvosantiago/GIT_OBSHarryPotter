import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;

import * as PIXI from "pixi.js";

declare const require: any;

// Imágenes (recomendado 1024–2048 px, con transparencia)
const seahorseUrl: string = require("../assets/seahorse.png");   // 2
const fishUrl:     string = require("../assets/fish.png");       // 3
const doryUrl:     string = require("../assets/dory.png");       // no usado en UCMA
const turtleUrl:   string = require("../assets/turtle.png");     // 4
const rayUrl:      string = require("../assets/ray.png");        // 5
const swordUrl:    string = require("../assets/sword.png");      // 6
const dolphinUrl:  string = require("../assets/dolphin.png");    // 7
const hammerUrl:   string = require("../assets/hammer.png");     // no usado en UCMA
const sharkUrl:    string = require("../assets/shark.png");      // 8
const jellyUrl:    string = require("../assets/jelly.png");      // 1

// Poseidon (>=9): 1 centro; 2+ izquierda/derecha
const poseidon1Url:  string = require("../assets/poseidon1.png");
const poseidon2Url:  string = require("../assets/poseidon2.png");
const poseidon3Url:  string = require("../assets/poseidon3.png");
const poseidon4Url:  string = require("../assets/poseidon4.png");
const unknownPoseidonUrl: string = require("../assets/advisors/unknown.png");

// Sirenas (9 matrículas) por asesora y Atenea (>=10, clave "nombre|atenea").
// Si falta la foto de una asesora se usa unknown.png.
const ADVISOR_POSEIDON_URLS: Record<string, string> = {
  "agustin oregioni": require("../assets/advisors/agustin-oregioni.png"),
  "agustina lopez": require("../assets/advisors/agustina_lopez.png"),
  "alejandra ferreiro": require("../assets/advisors/alejandra_ferreiro.png"),
  "alexia verdaguer": require("../assets/advisors/alexia-verdaguer.png"),
  "diana cubillo": require("../assets/advisors/diana_cubillo.png"),
  "ivan canale": require("../assets/advisors/ivan-canale.png"),
  "ivonne rose": require("../assets/advisors/ivonne-rose.png"),
  "laura norte": require("../assets/advisors/laura_norte.png"),
  "manuel martinez": require("../assets/advisors/manuel-martinez.png"),
  "mar guerrero": require("../assets/advisors/mar_guerrero.png"),
  "maribel weber": require("../assets/advisors/maribel_weber.png"),
  "marien serrano": require("../assets/advisors/marien-serrano.png"),
  "nicolas uriburu": require("../assets/advisors/nicolas-uriburu.png"),
  "paola suarez": require("../assets/advisors/paola-suarez.png"),
  "rocio jimenez": require("../assets/advisors/rocio-jimenez.png"),
  "susana pon": require("../assets/advisors/susana_pon.png"),
  "tatiana jimenez": require("../assets/advisors/tatiana-jimenez.png"),
  "diana cubillo|atenea": require("../assets/advisors/diana_cubillo_atenea.png"),
  "rocio jimenez|atenea": require("../assets/advisors/rocio_jimenez_atenea.png"),
  "maribel weber|atenea": require("../assets/advisors/maribel_weber_atenea.png"),
  "tatiana jimenez|atenea": require("../assets/advisors/tatiana_jimenez_atenea.png"),
};
const ATENEA_MIN_VALUE = 10;
function advisorKey(id: string, value?: number): string {
  const name = normalizeAdvisorName(id);
  return (value !== undefined && value >= ATENEA_MIN_VALUE) ? name + "|atenea" : name;
}

/** ====== Ajustes globales ====== **/
const BODY_H = {
  jelly:    0.90,
  seahorse: 0.60,
  fish:     0.60,
  dory:     0.60,
  turtle:   0.60,
  ray:      0.55,
  sword:    0.60,
  dolphin:  0.60, // ← NUEVO
  hammer:   0.60,
  shark:    0.60,
  poseidon: 0.70
} as const;

// Bordes y física
const BORDER_MARGIN    = 20;
const OFF_PAD          = 60;
const FRICTION         = 0.995;
const THRUST           = 3.0;
const RETARGET_MIN     = 2.5;
const RETARGET_MAX     = 6.5;

// Headway por carril/dirección (evita pelotones/“choques”)
const HEADWAY_BASE     = 40;
const HEADWAY_K        = 0.6;
const HEADWAY_FORCE    = 4.0;

// Concurrencia objetivo
const ACTIVE_TARGET_H  = 20; // horizontales
const ACTIVE_TARGET_J  = 15; // medusas

// Respawn
const RESPAWN_H_MIN    = 5;
const RESPAWN_H_MAX    = 12;
const RESPAWN_J_MIN    = 5;
const RESPAWN_J_MAX    = 10;

// Escalonado incial
const SPAWN_STAGGER_S  = 12;

// Etiquetas
const NAME_FONT_SIZE   = 14;
const VALUE_FONT_SIZE  = 12;
const LABEL_LINE_GAP   = 2;
const LABEL_GAP        = 3;
const LABEL_SAFE_K     = 1.3;

/** ====== Tamaño/Velocidad por especie (rango) ====== **/
const SIZE_RANGE = {
  jelly:    [30, 35],
  seahorse: [70, 80],     // 2
  fish:     [50, 60],     // 3
  dory:     [70, 80],     // no usado en UCMA
  turtle:   [130, 130],   // 4
  ray:      [242, 242],   // 5
  sword:    [130, 140],   // 6
  dolphin:  [140, 150],   // 7
  hammer:   [170, 170],   // no usado en UCMA
  shark:    [180, 200],   // 8
  poseidon: [180, 180]    // flotante
} as const;

const SPEED_RANGE = {
  jelly:    [20,  60],   // vertical
  seahorse: [50,  140],
  fish:     [50,  140],
  dory:     [70,  150],
  turtle:   [60,  120],
  ray:      [60,  140],
  sword:    [90,  180],
  dolphin:  [90,  180],  // ← NUEVO (ágil, como sword)
  hammer:   [70,  140],
  shark:    [60,  120],
  poseidon: [0,    0]    // no se usa; flotación central
} as const;

/** ====== Buckets por matriculas UCMA ====== **/
const BUCKETS = {
  jelly:    [1, 1] as const,           // 1
  seahorse: [2, 2] as const,           // 2
  fish:     [3, 3] as const,           // 3
  dory:     [4, 4] as const,           // no usado en UCMA
  turtle:   [4, 4] as const,           // 4
  ray:      [5, 5] as const,           // 5
  sword:    [6, 6] as const,           // 6
  dolphin:  [7, 7] as const,           // 7
  hammer:   [9, 9] as const,           // no usado en UCMA
  shark:    [8, 8] as const,           // 8
  poseidon: [9, Infinity] as const     // >=9 centro con Poseidon1
};

type Kind =
  | "jelly" | "seahorse" | "fish" | "dory" | "turtle" | "ray"
  | "sword" | "dolphin" | "hammer" | "shark" | "poseidon";

/** ====== Poseidon: flotación y posiciones ====== **/
const POSEIDON_HEIGHT_K      = 1.25; // alto final = sizePx * K (igual para todas las sirenas)
const POSEIDON_FLOAT_AMP_PX  = 12;  // amplitud (px)
const POSEIDON_FLOAT_FREQ_HZ = 0.55; // Hz
const POSEIDON_Y_OFFSET      = 10;   // offset base (px)
const POSEIDON_X_LEFT_K      = 0.20; // izquierda (0..1 del ancho)
const POSEIDON_X_RIGHT_K     = 0.80; // derecha   (0..1 del ancho)
const POSEIDON_Y_TOP_OFFSET  = -180; // esquinas superiores
const POSEIDON_Y_BOT_OFFSET  = 150;  // esquinas inferiores

/** ====== Z-ORDER ======
 * Poseidon (sprite+label) por delante de todo,
 * las etiquetas de otros quedan detrás de Poseidon.
 */
const Z_SPRITE_BG        = 100;  // medusas
const Z_SPRITE_FG        = 300;  // peces estándar
const Z_LABEL_OTHERS     = 350;  // etiquetas peces/otros (por detrás de Poseidon)
const Z_SPRITE_POSEIDON  = 800;  // figura Poseidon
const Z_LABEL_POSEIDON   = 900;  // etiqueta Poseidon

/** Utilidades **/
let fallbackRandSeed = 0x9e3779b9;
function rand01(): number {
  const a = new Uint32Array(1);
  if ((window as any)?.crypto?.getRandomValues) {
    (window as any).crypto.getRandomValues(a);
    return a[0] / 0xffffffff;
  }
  fallbackRandSeed ^= fallbackRandSeed << 13;
  fallbackRandSeed ^= fallbackRandSeed >>> 17;
  fallbackRandSeed ^= fallbackRandSeed << 5;
  return (fallbackRandSeed >>> 0) / 0xffffffff;
}
function randRange(a: number, b: number) { return a + (b - a) * rand01(); }
function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function hash32(str: string): number {
  let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
  return (h >>> 0);
}
function normalizeAdvisorName(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Clasificación por matrículas exacta según requisitos */
function classifyKind(v?: number): Kind {
  if (v === 1) return "jelly";
  if (v === 2) return "seahorse";
  if (v === 3) return "fish";
  if (v === 4) return "turtle";
  if (v === 5) return "ray";
  if (v === 6) return "sword";
  if (v === 7) return "dolphin";
  if (v !== undefined && v >= 9) return "poseidon";
  if (v === 8) return "shark";
  return "fish";
}
function bucketT(kind: Kind, v?: number): number {
  if (v === undefined) return 0.5;
  const [a, b] = BUCKETS[kind];
  if (!isFinite(b)) {
    const t = (v - a) / Math.max(1, 20 - a);
    return clamp(t, 0, 1);
  }
  return a === b ? 0 : clamp((v - a) / Math.max(1, b - a), 0, 1);
}
function sizeFor(kind: Kind, v?: number): number {
  const [sMin, sMax] = SIZE_RANGE[kind];
  const t = bucketT(kind, v);
  return lerp(sMin, sMax, t);
}
function speedRange(kind: Kind): [number, number] {
  const r = SPEED_RANGE[kind];
  return [r[0], r[1]];
}

type PoseidonSide = "left" | "right" | "center";
type PoseidonSlot = 1 | 2 | 3 | 4 | 5;

interface NodeDatum {
  id: string;
  value?: number;
  kind: Kind;

  sprite?: PIXI.Sprite;

  label?: PIXI.Container;
  nameText?: PIXI.Text;
  valText?: PIXI.Text;

  x: number; y: number;
  vx: number; vy: number;

  laneIdx: number;
  laneOffset?: number;
  sizePx: number;
  baseScale: number;

  speedMag: number;
  speedMul: number;
  tNext: number;

  isActive: boolean;
  nextSpawn: number;
  dir: 1 | -1;

  // Medusas / Poseidon flotación
  x0?: number;
  phase?: number;
  wAmp?: number;
  wFreq?: number;
  pPhase?: number;

  // Poseidon: lado/imagen
  pSide?: PoseidonSide;
  pSlot?: PoseidonSlot;
  pYOffset?: number;
}

export class Visual implements IVisual {
  private host!: powerbi.extensibility.visual.IVisualHost;
  private root!: HTMLElement;
  private debugEl!: HTMLPreElement;

  private app?: PIXI.Application;
  private stage?: PIXI.Container;
  private pixiReady = false;
  private lastPixiError = "";

  private seahorseTex?: PIXI.Texture;
  private fishTex?: PIXI.Texture;
  private doryTex?: PIXI.Texture;
  private turtleTex?: PIXI.Texture;
  private rayTex?: PIXI.Texture;
  private swordTex?: PIXI.Texture;
  private dolphinTex?: PIXI.Texture;   // ← NUEVO
  private hammerTex?: PIXI.Texture;
  private sharkTex?: PIXI.Texture;
  private poseidon1Tex?: PIXI.Texture;
  private poseidon2Tex?: PIXI.Texture;
  private poseidon3Tex?: PIXI.Texture;
  private poseidon4Tex?: PIXI.Texture;
  private unknownPoseidonTex?: PIXI.Texture;
  private advisorPoseidonTex = new Map<string, PIXI.Texture>();
  private jellyTex?: PIXI.Texture;
  private texReady = false;

  private seahorseBaseW = 512;
  private fishBaseW = 512;
  private doryBaseW = 512;
  private turtleBaseW = 512;
  private rayBaseW = 512;
  private swordBaseW = 512;
  private dolphinBaseW = 512; // ← NUEVO
  private hammerBaseW = 512;
  private sharkBaseW = 512;
  private poseidon1BaseW = 768;
  private poseidon2BaseW = 768;
  private poseidon3BaseW = 768;
  private poseidon4BaseW = 768;
  private unknownPoseidonBaseW = 768;
  private advisorPoseidonBaseW = new Map<string, number>();
  private jellyBaseW = 512;

  private nodes: NodeDatum[] = [];
  private tickBound?: (delta: number) => void;

  // Layout vertical
  private laneCenters: number[] = [];
  private laneCount = 1;
  private topMargin = 24;
  private bottomMargin = 24;

  // Tiempo acumulado
  private timeSec = 0;

  // Manejo de contexto/visibilidad
  private needsRebuild = false;
  private visHandler?: () => void;
  private ctxLostHandler?: (e: Event) => void;
  private ctxRestoredHandler?: () => void;

  constructor(options?: VisualConstructorOptions) {
    this.host = options?.host as powerbi.extensibility.visual.IVisualHost;

    this.root = document.createElement("div");
    this.root.className = "visual-host";
    (options?.element ?? document.body).appendChild(this.root);

    this.debugEl = document.createElement("pre");
    Object.assign(this.debugEl.style as any, {
      background: "#444", color: "#fff", padding: "4px 6px",
      borderRadius: "4px", display: "inline-block", maxWidth: "100%",
      whiteSpace: "pre-wrap", margin: "4px 0 0 0"
    });
    this.root.appendChild(this.debugEl);

    const w = Math.max(10, options?.element?.clientWidth || 320);
    const h = Math.max(10, options?.element?.clientHeight || 180);
    this.initPixi(w, h);
    this.loadTextures();
  }

  private initPixi(width: number, height: number) {
    try {
      const app = new PIXI.Application({
        width, height,
        antialias: true,
        autoDensity: true,
        resolution: (window as any)?.devicePixelRatio || 1,
        backgroundAlpha: 0,
        powerPreference: "high-performance"
      });
      this.root.insertBefore(app.view as HTMLCanvasElement, this.debugEl);

      this.app = app;
      this.stage = app.stage;
      this.pixiReady = true;
      this.lastPixiError = "";
      this.timeSec = 0;

      // Habilitar orden por zIndex
      this.stage.sortableChildren = true;

      // WebGL context
      const view = app.view as HTMLCanvasElement;

      this.ctxLostHandler = (e: Event) => {
        (e as any).preventDefault?.();
        this.texReady = false;
        this.needsRebuild = true;
      };

      this.ctxRestoredHandler = () => {
        this.loadTextures().then(() => {
          this.needsRebuild = true;
        }).catch(() => {
          this.needsRebuild = true;
        });
      };

      view.addEventListener("webglcontextlost", this.ctxLostHandler as any, { passive: false } as any);
      view.addEventListener("webglcontextrestored", this.ctxRestoredHandler as any);

      // Visibilidad
      this.visHandler = () => {
        if (document.hidden) {
          this.app?.stop();
        } else {
          this.app?.start();
          const wv = this.root.clientWidth || width;
          const hv = this.root.clientHeight || height;
          this.app?.renderer.resize(wv, hv);
          this.needsRebuild = true;
        }
      };
      document.addEventListener("visibilitychange", this.visHandler);

      // ticker
      this.tickBound = (delta: number) => this.onTick(delta);
      this.app.ticker.add(this.tickBound);

      this.updateDebug(width, height, 0, false, false);
    } catch (e: any) {
      this.pixiReady = false;
      this.lastPixiError = String(e?.message || e || "init failed");
      this.updateDebug(width, height, 0, false, false);
    }
  }

  // Carga de una textura
  private async loadOne(url: string): Promise<{ tex?: PIXI.Texture; baseW?: number }> {
    try {
      const tex = PIXI.Texture.from(url);
      if (!tex.baseTexture.valid) {
        await new Promise<void>((resolve, reject) => {
          const bt = tex.baseTexture as any;
          const onLoaded = () => { bt.off("error", onError); resolve(); };
          const onError = (err: any) => reject(err);
          bt.once("loaded", onLoaded);
          bt.once("error", onError);
        });
      }
      tex.baseTexture.mipmap = PIXI.MIPMAP_MODES.ON;
      tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      const baseW = (tex.baseTexture as any).realWidth ?? tex.width ?? 512;
      return { tex, baseW };
    } catch {
      return {};
    }
  }

  // Carga en PARALELO
  private async loadTextures() {
    const advisorPoseidonEntries = Object.entries(ADVISOR_POSEIDON_URLS);
    const [
      seahorse, fish, dory, turtle, ray, sword, dolphin, hammer, shark,
      poseidon1, poseidon2, poseidon3, poseidon4, unknownPoseidon, jelly
    ] = await Promise.all([
      this.loadOne(seahorseUrl),
      this.loadOne(fishUrl),
      this.loadOne(doryUrl),
      this.loadOne(turtleUrl),
      this.loadOne(rayUrl),
      this.loadOne(swordUrl),
      this.loadOne(dolphinUrl), // ← NUEVO
      this.loadOne(hammerUrl),
      this.loadOne(sharkUrl),
      this.loadOne(poseidon1Url),
      this.loadOne(poseidon2Url),
      this.loadOne(poseidon3Url),
      this.loadOne(poseidon4Url),
      this.loadOne(unknownPoseidonUrl),
      this.loadOne(jellyUrl),
    ]);
    const advisorPoseidons = await Promise.all(
      advisorPoseidonEntries.map(async ([name, url]) => ({ name, loaded: await this.loadOne(url) }))
    );

    if (seahorse.tex)  { this.seahorseTex = seahorse.tex;   this.seahorseBaseW = seahorse.baseW ?? this.seahorseBaseW; }
    if (fish.tex)      { this.fishTex = fish.tex;           this.fishBaseW = fish.baseW ?? this.fishBaseW; }
    if (dory.tex)      { this.doryTex = dory.tex;           this.doryBaseW = dory.baseW ?? this.doryBaseW; }
    if (turtle.tex)    { this.turtleTex = turtle.tex;       this.turtleBaseW = turtle.baseW ?? this.turtleBaseW; }
    if (ray.tex)       { this.rayTex = ray.tex;             this.rayBaseW = ray.baseW ?? this.rayBaseW; }
    if (sword.tex)     { this.swordTex = sword.tex;         this.swordBaseW = sword.baseW ?? this.swordBaseW; }
    if (dolphin.tex)   { this.dolphinTex = dolphin.tex;     this.dolphinBaseW = dolphin.baseW ?? this.dolphinBaseW; } // ← NUEVO
    if (hammer.tex)    { this.hammerTex = hammer.tex;       this.hammerBaseW = hammer.baseW ?? this.hammerBaseW; }
    if (shark.tex)     { this.sharkTex = shark.tex;         this.sharkBaseW = shark.baseW ?? this.sharkBaseW; }
    if (poseidon1.tex) { this.poseidon1Tex = poseidon1.tex; this.poseidon1BaseW = poseidon1.baseW ?? this.poseidon1BaseW; }
    if (poseidon2.tex) { this.poseidon2Tex = poseidon2.tex; this.poseidon2BaseW = poseidon2.baseW ?? this.poseidon2BaseW; }
    if (poseidon3.tex) { this.poseidon3Tex = poseidon3.tex; this.poseidon3BaseW = poseidon3.baseW ?? this.poseidon3BaseW; }
    if (poseidon4.tex) { this.poseidon4Tex = poseidon4.tex; this.poseidon4BaseW = poseidon4.baseW ?? this.poseidon4BaseW; }
    if (unknownPoseidon.tex) { this.unknownPoseidonTex = unknownPoseidon.tex; this.unknownPoseidonBaseW = unknownPoseidon.baseW ?? this.unknownPoseidonBaseW; }
    if (jelly.tex)     { this.jellyTex = jelly.tex;         this.jellyBaseW = jelly.baseW ?? this.jellyBaseW; }
    for (const { name, loaded } of advisorPoseidons) {
      if (loaded.tex) {
        this.advisorPoseidonTex.set(name, loaded.tex);
        this.advisorPoseidonBaseW.set(name, loaded.baseW ?? 768);
      }
    }

    this.texReady = !!(
      this.seahorseTex || this.fishTex || this.doryTex || this.turtleTex || this.rayTex || this.swordTex ||
      this.dolphinTex || this.hammerTex || this.sharkTex ||
      this.poseidon1Tex || this.poseidon2Tex || this.poseidon3Tex || this.poseidon4Tex ||
      this.unknownPoseidonTex || this.advisorPoseidonTex.size > 0 || this.jellyTex
    );

    if (this.stage && this.nodes?.length) {
      this.ensureSpritesAndLabels();
      // Activación inmediata de poseidon tras tener sprite/label
      const w = this.root.clientWidth || 1;
      const h = this.root.clientHeight || 1;
      for (const n of this.nodes) {
        if (n.kind === "poseidon" && !n.isActive && n.sprite) {
          this.activateNode(n, w, h);
        }
      }
      this.needsRebuild = true;
    }
  }

  // helpers de texturas/baseW (sin fallback a fish)
  private texFor(kind: Kind, n?: NodeDatum): PIXI.Texture | undefined {
    switch (kind) {
      case "jelly":    return this.jellyTex;
      case "seahorse": return this.seahorseTex;
      case "fish":     return this.fishTex;
      case "dory":     return this.doryTex;
      case "turtle":   return this.turtleTex;
      case "ray":      return this.rayTex;
      case "sword":    return this.swordTex;
      case "dolphin":  return this.dolphinTex; // ← NUEVO
      case "hammer":   return this.hammerTex;
      case "shark":    return this.sharkTex;
      case "poseidon":
        if (n?.id) {
          const advisorTex = this.advisorPoseidonTex.get(advisorKey(n.id, n.value));
          if (advisorTex) return advisorTex;
        }
        return this.unknownPoseidonTex || this.poseidon1Tex;
    }
  }
  private baseWFor(kind: Kind, n?: NodeDatum): number {
    switch (kind) {
      case "jelly":    return this.jellyBaseW;
      case "seahorse": return this.seahorseBaseW;
      case "fish":     return this.fishBaseW;
      case "dory":     return this.doryBaseW;
      case "turtle":   return this.turtleBaseW;
      case "ray":      return this.rayBaseW;
      case "sword":    return this.swordBaseW;
      case "dolphin":  return this.dolphinBaseW; // ← NUEVO
      case "hammer":   return this.hammerBaseW;
      case "shark":    return this.sharkBaseW;
      case "poseidon":
        if (n?.id) {
          const advisorBaseW = this.advisorPoseidonBaseW.get(advisorKey(n.id, n.value));
          if (advisorBaseW) return advisorBaseW;
        }
        return this.unknownPoseidonTex ? this.unknownPoseidonBaseW : this.poseidon1BaseW;
      default:         return 512;
    }
  }

  private updateDebug(w: number, h: number, count: number, hasCat = false, hasVals = false) {
    const extra = this.lastPixiError ? `, pixiErr="${this.lastPixiError}"` : "";
    this.debugEl.textContent =
      `update(): ${w}x${h}, items=${count}, pixiReady=${this.pixiReady}, texReady=${this.texReady}${extra}\n` +
      `cat=${hasCat} vals=${hasVals} | lanes=${this.laneCount}`;
  }

  public update(options: VisualUpdateOptions): void {
    const w = Math.max(10, Math.floor(options.viewport.width || 0));
    const h = Math.max(10, Math.floor(options.viewport.height || 0));
    if (this.app) this.app.renderer.resize(w, h);

    const dv = options.dataViews?.[0];
    const hasCat = !!dv?.categorical?.categories?.length;
    const hasVals = !!dv?.categorical?.values?.length;

    const items = this.extractItems(dv);
    const count = items.length;

    if (!this.pixiReady || !this.stage) {
      this.updateDebug(w, h, count, hasCat, hasVals);
      return;
    }

    this.updateDebug(w, h, count, hasCat, hasVals);

    if (count === 0) {
      this.clearStage();
      return;
    }

    this.upsertNodes(items, w, h);        // crea/actualiza nodos + layout
    this.ensureSpritesAndLabels();         // prepara sprites/labels

    // ACTIVACIÓN INMEDIATA de poseidon
    for (const n of this.nodes) {
      if (n.kind === "poseidon" && !n.isActive && n.sprite) {
        this.activateNode(n, w, h);
      }
    }
  }

  /** Lectura de datos */
  private extractItems(dv?: DataView): Array<{ id: string; value?: number }> {
    if (!dv?.categorical) return [];
    const cat = dv.categorical.categories?.[0];
    const ids = (cat?.values || []).map(v => String(v ?? "").trim());

    let vals: (number | null | undefined)[] = [];
    const values = dv.categorical.values;
    if (values && values.length > 0) {
      let col = values.find(c => (c.source as any)?.roles?.matriculas);
      if (!col) col = values[0];
      vals = (col.values || []) as (number | null | undefined)[];
    }

    const items: Array<{ id: string; value?: number }> = [];
    for (let i = 0; i < ids.length; i++) {
      const raw = vals[i];
      const v = (raw === null || raw === undefined) ? undefined : Number(raw);
      items.push({ id: ids[i], value: isFinite(v as number) ? (v as number) : undefined });
    }
    return items;
  }

  /** Layout vertical seguro */
  private computeLayout(h: number, sizes: number[], kinds: Kind[]) {
    const wantedLanes = Math.max(1, Math.ceil(sizes.length / 2));

    let maxHalf = 24;
    const labelH = (NAME_FONT_SIZE + LABEL_LINE_GAP + VALUE_FONT_SIZE) * LABEL_SAFE_K;
    for (let i = 0; i < sizes.length; i++) {
      const k = kinds[i] ?? "fish";
      const half = sizes[i] * (BODY_H[k] ?? 0.6) * 0.5;
      if (half > maxHalf) maxHalf = half;
    }

    this.topMargin = Math.ceil(maxHalf + 6);
    this.bottomMargin = Math.ceil(maxHalf + LABEL_GAP + labelH + 6);

    const avail = Math.max(1, h - this.topMargin - this.bottomMargin);
    this.laneCount = wantedLanes;
    if (!isFinite(this.laneCount) || this.laneCount < 1 || avail < 1) this.laneCount = 1;

    const step = avail / this.laneCount;
    this.laneCenters = Array.from({ length: this.laneCount }, (_, i) => this.topMargin + step * (i + 0.5));
  }

  /** Alta/actualización + asignación lado poseidon */
  private upsertNodes(items: Array<{ id: string; value?: number }>, w: number, h: number) {
    const byId = new Map(this.nodes.map(n => [n.id, n] as const));

    const sizes: number[] = [];
    const kinds: Kind[] = [];
    const precomputed: Array<{ id: string; effValue?: number; effKind: Kind; laneIdx: number; }> = [];

    // Orden estable para carriles
    const shuffled = items.map(it => ({ it, h: hash32(it.id) })).sort((a, b) => (a.h - b.h));
    const laneById = new Map<string, number>();
    shuffled.forEach((row, pos) => laneById.set(row.it.id, Math.floor(pos / 2)));

    for (const it of items) {
      const prev = byId.get(it.id);
      const desiredKind = classifyKind(it.value);
      const effValue = (it.value === undefined && prev) ? prev.value : it.value;
      const effKind  = (it.value === undefined && prev) ? prev.kind  : desiredKind;
      const sizePx   = sizeFor(effKind, effValue);
      sizes.push(sizePx);
      kinds.push(effKind);
      precomputed.push({ id: it.id, effValue, effKind, laneIdx: laneById.get(it.id) ?? 0 });
    }

    this.computeLayout(h, sizes, kinds);

    // Hasta 5 Poseidones: 4 esquinas + 1 centro.
    const poseidonIds = precomputed
      .filter(p => p.effKind === "poseidon")
      .map(p => p.id)
      .sort((a, b) => hash32(a) - hash32(b));

    const poseidonSideMap = new Map<string, PoseidonSide>();
    const poseidonSlotMap = new Map<string, PoseidonSlot>();
    const poseidonYOffsetMap = new Map<string, number>();
    if (poseidonIds.length === 1) {
      poseidonSideMap.set(poseidonIds[0], "center");
      poseidonSlotMap.set(poseidonIds[0], 5);
      poseidonYOffsetMap.set(poseidonIds[0], 0);
    } else if (poseidonIds.length >= 2) {
      for (let i = 0; i < poseidonIds.length; i++) {
        const id = poseidonIds[i];
        const slot = Math.min(i + 1, 5) as PoseidonSlot;
        poseidonSlotMap.set(id, slot);
        if (slot === 5) {
          poseidonSideMap.set(id, "center");
          poseidonYOffsetMap.set(id, 0);
        } else {
          poseidonSideMap.set(id, (slot % 2 === 1) ? "left" : "right");
          poseidonYOffsetMap.set(id, poseidonIds.length === 2
            ? 0
            : (slot <= 2 ? POSEIDON_Y_TOP_OFFSET : POSEIDON_Y_BOT_OFFSET));
        }
      }
    }

    const now = this.timeSec || 0;
    const next: NodeDatum[] = [];
    const seen = new Set<string>();

    precomputed.forEach((row, idx) => {
      const it = items[idx];
      seen.add(row.id);

      const prev = byId.get(row.id);
      const laneIdx = clamp(row.laneIdx, 0, Math.max(0, this.laneCount - 1));
      const sizePx = sizes[idx];

      const speedMul = prev?.speedMul ?? randRange(0.7, 1.3);
      const [sMin, sMax] = speedRange(row.effKind);
      const t = bucketT(row.effKind, row.effValue);
      const baseSpeed = lerp(sMin, sMax, t) * speedMul;

      let n = prev;
      if (!n) {
        n = {
          id: row.id,
          value: row.effValue,
          kind: row.effKind,
          x: 0, y: 0,
          vx: 0, vy: 0,
          laneIdx,
          laneOffset: 0,
          sizePx,
          baseScale: 1,
          speedMag: baseSpeed,
          speedMul,
          tNext: randRange(RETARGET_MIN, RETARGET_MAX),
          isActive: false,
          nextSpawn: now + ((hash32(row.id) % 1000) / 1000) * SPAWN_STAGGER_S,
          dir: rand01() > 0.5 ? 1 : -1
        };
      } else {
        n.value = row.effValue;
        n.kind  = row.effKind;
        n.sizePx = sizePx;
        n.laneIdx = laneIdx;
        n.speedMag = baseSpeed;
      }

      if (n.kind === "poseidon") {
        n.pSide = poseidonSideMap.get(n.id) || "center";
        n.pSlot = poseidonSlotMap.get(n.id) || 1;
        n.pYOffset = poseidonYOffsetMap.get(n.id) || 0;
      }

      next.push(n);
    });

    // elimina los que faltan
    for (const [id, n] of byId) {
      if (!seen.has(id)) {
        n.sprite?.parent?.removeChild(n.sprite);
        n.sprite?.destroy();
        if (n.label) { n.label.parent?.removeChild(n.label); n.label.destroy({ children: true }); }
      }
    }

    this.nodes = next;
  }

  /** Sprites y etiquetas; visibilidad ligada a isActive **y** a que haya sprite */
  private ensureSpritesAndLabels() {
    if (!this.stage) return;

    const nameStyle = new PIXI.TextStyle({
      fill: "#eaf6ff", fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: NAME_FONT_SIZE, fontWeight: "600",
      stroke: "#00131f", strokeThickness: 3, align: "center"
    });
    const valueStyle = new PIXI.TextStyle({
      fill: "#bfe7ff", fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: VALUE_FONT_SIZE, fontWeight: "500",
      stroke: "#00131f", strokeThickness: 3, align: "center"
    });

    this.nodes.forEach(n => {
      const desiredTex = this.texFor(n.kind, n);
      const baseW = this.baseWFor(n.kind, n);

      // Poseidon/sirenas: las imágenes tienen distinto aspect ratio, así que se
      // normaliza por ALTO (no por ancho) para que todas midan lo mismo.
      const texH = (desiredTex as any)?.height as number | undefined;
      const s = (n.kind === "poseidon" && texH)
        ? Math.min(1, (n.sizePx * POSEIDON_HEIGHT_K) / texH)
        : Math.min(1, n.sizePx / Math.max(1, baseW));
      n.baseScale = s > 0 ? s : 0.001;

      // SPRITE
      if (!n.sprite) {
        if (desiredTex) {
          const sp = new PIXI.Sprite(desiredTex);
          sp.anchor.set(0.5);
          sp.x = n.x; sp.y = n.y;
          sp.scale.set(n.baseScale, n.baseScale);
          sp.visible = false;
          sp.zIndex = (n.kind === "poseidon") ? Z_SPRITE_POSEIDON : (n.kind === "jelly" ? Z_SPRITE_BG : Z_SPRITE_FG);
          this.stage!.addChild(sp);
          n.sprite = sp;
        }
      } else {
        if (desiredTex && n.sprite.texture !== desiredTex) n.sprite.texture = desiredTex;
        const sign = Math.sign(n.sprite.scale.x) || 1;
        n.sprite.scale.set(Math.abs(n.baseScale) * sign, n.baseScale);
        n.sprite.zIndex = (n.kind === "poseidon") ? Z_SPRITE_POSEIDON : (n.kind === "jelly" ? Z_SPRITE_BG : Z_SPRITE_FG);
      }

      // LABEL (zIndex depende de especie)
      const wantLabelZ = (n.kind === "poseidon") ? Z_LABEL_POSEIDON : Z_LABEL_OTHERS;

      if (!n.label) {
        const container = new PIXI.Container();
        container.zIndex = wantLabelZ;
        const tName = new PIXI.Text(n.id, nameStyle);
        tName.anchor.set(0.5, 0);
        const tVal = new PIXI.Text((n.value ?? 0).toLocaleString?.("es-ES") ?? String(n.value ?? 0), valueStyle);
        tVal.anchor.set(0.5, 0);
        tVal.y = tName.height + LABEL_LINE_GAP;
        container.addChild(tName, tVal);
        container.visible = false;
        this.stage!.addChild(container);
        n.label = container; n.nameText = tName; n.valText = tVal;
      } else {
        n.label.zIndex = wantLabelZ;
        if (n.nameText && n.nameText.text !== n.id) n.nameText.text = n.id;
        const newVal = (n.value ?? 0).toLocaleString?.("es-ES") ?? String(n.value ?? 0);
        if (n.valText && n.valText.text !== newVal) {
          n.valText.text = newVal;
          if (n.nameText) n.valText.y = n.nameText.height + LABEL_LINE_GAP;
        }
      }

      // visibilidad ligada al estado Y a que exista sprite
      if (n.sprite) n.sprite.visible = !!n.isActive;
      if (n.label)  n.label.visible  = !!n.isActive && !!n.sprite;
    });
  }

  /** Reconstruye sprites tras restaurar contexto o volver a la página */
  private rebuildAllSprites() {
    if (!this.stage) return;
    this.nodes.forEach(n => {
      if (n.sprite) {
        n.sprite.parent?.removeChild(n.sprite);
        n.sprite.destroy();
        n.sprite = undefined;
      }
      if (n.label) n.label.visible = false;
    });
    if (!this.texReady) return;
    this.ensureSpritesAndLabels();
    this.nodes.forEach(n => {
      if (n.sprite) {
        n.sprite.visible = !!n.isActive;
        if (n.label) n.label.visible = !!n.isActive;
      }
    });
    const w = this.root.clientWidth || 1;
    const h = this.root.clientHeight || 1;
    this.app?.renderer.resize(w, h);
  }

  /** Activar/desactivar */
  private activateNode(n: NodeDatum, w: number, h: number) {
    n.isActive = true;

    if (n.kind === "jelly") {
      n.y = -this.topMargin - randRange(0, h * 0.5);
      n.x0 = randRange(BORDER_MARGIN, w - BORDER_MARGIN);
      n.phase = randRange(0, Math.PI * 2);
      n.wAmp = randRange(18, 60);
      n.wFreq = randRange(0.6, 1.4);
      n.vy = n.speedMag;
      n.x = n.x0 + Math.sin(n.phase) * (n.wAmp ?? 30);
    } else if (n.kind === "poseidon") {
      n.dir = 1;
      n.vx = 0; n.vy = 0;
      n.pPhase = randRange(0, Math.PI * 2);
      if (n.pSide === "left") n.x = w * POSEIDON_X_LEFT_K;
      else if (n.pSide === "right") n.x = w * POSEIDON_X_RIGHT_K;
      else n.x = w * 0.5;
      n.y = h * 0.5 + POSEIDON_Y_OFFSET + (n.pYOffset || 0);
    } else {
      n.dir = rand01() > 0.5 ? 1 : -1;
      const avail = Math.max(1, h - this.topMargin - this.bottomMargin);
      const step = avail / Math.max(1, this.laneCount);
      const yCenter = this.laneCenters[n.laneIdx] ?? (h / 2);
      const jitter = clamp(randRange(-step * 0.25, step * 0.25), -step * 0.3, step * 0.3);
      n.laneOffset = jitter;

      n.y = yCenter + (n.laneOffset || 0);
      if (n.dir === 1) { n.x = -OFF_PAD;      n.vx =  Math.abs(n.speedMag); }
      else             { n.x =  w + OFF_PAD;  n.vx = -Math.abs(n.speedMag); }
      n.vy = 0;
    }

    if (n.sprite) {
      n.sprite.visible = true;
      n.sprite.x = n.x; n.sprite.y = n.y;
      if (n.kind === "jelly" || n.kind === "poseidon") {
        n.sprite.scale.x = Math.abs(n.baseScale);
        n.sprite.scale.y = n.baseScale;
      } else {
        const sgn = (n.dir === 1 ? 1 : -1);
        n.sprite.scale.x = Math.abs(n.baseScale) * sgn;
        n.sprite.scale.y = n.baseScale;
      }
    }
    if (n.label) {
      n.label.visible = !!n.sprite;
      const halfH = n.sizePx * (BODY_H[n.kind] ?? 0.6) * 0.5;
      n.label.x = n.x; n.label.y = n.y + halfH + LABEL_GAP;
      n.label.zIndex = (n.kind === "poseidon") ? Z_LABEL_POSEIDON : Z_LABEL_OTHERS;
    }
  }

  private deactivateNode(n: NodeDatum, delayMin: number, delayMax: number) {
    n.isActive = false;

    // Respawn proporcional al tiempo de cruce
    const w = this.root.clientWidth || 1;
    const travelT = (w + 2 * OFF_PAD) / Math.max(1, n.speedMag);
    const base = randRange(0.35, 0.65);
    const jittered = base * travelT;

    if (n.kind === "poseidon") {
      n.nextSpawn = this.timeSec + clamp(jittered * 0.3, 1, 4);
    } else if (n.kind === "jelly") {
      n.nextSpawn = this.timeSec + clamp(jittered, RESPAWN_J_MIN, RESPAWN_J_MAX);
    } else {
      n.nextSpawn = this.timeSec + clamp(jittered, RESPAWN_H_MIN, RESPAWN_H_MAX);
      if (this.laneCount > 1) {
        const delta = 1 + Math.floor(rand01() * (this.laneCount - 1));
        n.laneIdx = (n.laneIdx + delta) % this.laneCount;
      }
    }

    if (n.sprite) n.sprite.visible = false;
    if (n.label)  n.label.visible  = false;
  }

  /** Animación */
  private onTick(delta: number) {
    if (!this.app || !this.stage) return;

    if (this.needsRebuild) {
      this.rebuildAllSprites();
      if (this.texReady) this.needsRebuild = false;
    }

    const dtRaw = this.app.ticker.deltaMS / 1000;
    const dt = Math.min(dtRaw, 0.05);
    this.timeSec += dt;

    const w = this.root.clientWidth || 1;
    const h = this.root.clientHeight || 1;

    // 0) retarget de velocidad
    for (const n of this.nodes) {
      n.tNext -= dt;
      if (n.tNext <= 0) {
        const [sMin, sMax] = speedRange(n.kind);
        const t = bucketT(n.kind, n.value);
        n.speedMag = lerp(sMin, sMax, t) * (n.speedMul || 1.0);
        n.tNext = randRange(RETARGET_MIN, RETARGET_MAX);
        if (n.kind === "jelly" && n.isActive) n.vy = n.speedMag;
        if (!n.isActive && n.sprite) {
          const sign = Math.sign(n.sprite.scale.x) || 1;
          n.sprite.scale.set(Math.abs(n.baseScale) * sign, n.baseScale);
        }
      }
    }

    // 1) mover activos
    let activeH = 0, activeJ = 0;

    for (const n of this.nodes) {
      if (!n.isActive) continue;

      if (n.kind === "jelly") {
        n.phase = (n.phase ?? 0) + (n.wFreq ?? 1) * dt;
        const xCenter = n.x0 ?? n.x;
        n.x = xCenter + Math.sin(n.phase) * (n.wAmp ?? 30);
        n.y += (n.vy || n.speedMag || 50) * dt;

        if (n.y > h + this.bottomMargin + OFF_PAD) {
          this.deactivateNode(n, RESPAWN_J_MIN, RESPAWN_J_MAX);
        } else {
          activeJ++;
        }
      } else if (n.kind === "poseidon") {
        n.pPhase = (n.pPhase ?? 0) + (POSEIDON_FLOAT_FREQ_HZ * Math.PI * 2) * dt;
        if (n.pSide === "left") n.x = w * POSEIDON_X_LEFT_K;
        else if (n.pSide === "right") n.x = w * POSEIDON_X_RIGHT_K;
        else n.x = w * 0.5;
        const baseY = h * 0.5 + POSEIDON_Y_OFFSET + (n.pYOffset || 0);
        n.y = baseY + Math.sin(n.pPhase) * POSEIDON_FLOAT_AMP_PX;
      } else {
        const targetY = (this.laneCenters[n.laneIdx] ?? (h / 2)) + (n.laneOffset || 0);
        const dy = targetY - n.y;
        n.vy = dy * 8.0 * dt;
        n.y += n.vy;

        n.vx *= FRICTION;
        const targetVx = (n.dir === 1 ? 1 : -1) * (n.speedMag || 60);
        n.vx += (targetVx - n.vx) * THRUST * dt;

        n.x += n.vx * dt;

        if ((n.dir === 1 && n.x > w + OFF_PAD) || (n.dir === -1 && n.x < -OFF_PAD)) {
          this.deactivateNode(n, RESPAWN_H_MIN, RESPAWN_H_MAX);
        } else {
          activeH++;
        }
      }

      // Sprite / Label
      if (n.sprite) {
        n.sprite.x = n.x; n.sprite.y = n.y;
        if (n.kind === "jelly" || n.kind === "poseidon") {
          n.sprite.scale.x = Math.abs(n.baseScale);
          n.sprite.scale.y = n.baseScale;
        } else {
          const sgn = (n.dir === 1 ? 1 : -1);
          n.sprite.scale.x = Math.abs(n.baseScale) * sgn;
          n.sprite.scale.y = n.baseScale;
        }
      }
      if (n.label) {
        const halfH = n.sizePx * (BODY_H[n.kind] ?? 0.6) * 0.5;
        n.label.x = n.x; n.label.y = n.y + halfH + LABEL_GAP;
        n.label.zIndex = (n.kind === "poseidon") ? Z_LABEL_POSEIDON : Z_LABEL_OTHERS;
        n.label.visible = !!n.isActive && !!n.sprite;
      }
    }

    // 2) Headway (Poseidon no participa)
    const lanesFwd = new Map<number, NodeDatum[]>();
    const lanesBwd = new Map<number, NodeDatum[]>();
    for (const n of this.nodes) {
      if (!n.isActive || n.kind === "jelly" || n.kind === "poseidon") continue;
      const map = n.dir === 1 ? lanesFwd : lanesBwd;
      const arr = map.get(n.laneIdx) || [];
      arr.push(n);
      map.set(n.laneIdx, arr);
    }
    for (const [, arr] of lanesFwd) {
      arr.sort((a, b) => a.x - b.x);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1], cur = arr[i];
        const minGap = HEADWAY_BASE + HEADWAY_K * 0.5 * (prev.sizePx + cur.sizePx);
        const desiredX = prev.x + minGap;
        const e = desiredX - cur.x;
        if (e > 0) cur.vx += e * HEADWAY_FORCE * dt;
      }
    }
    for (const [, arr] of lanesBwd) {
      arr.sort((a, b) => b.x - a.x);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1], cur = arr[i];
        const minGap = HEADWAY_BASE + HEADWAY_K * 0.5 * (prev.sizePx + cur.sizePx);
        const desiredX = prev.x - minGap;
        const e = cur.x - desiredX;
        if (e > 0) cur.vx -= e * HEADWAY_FORCE * dt;
      }
    }

    // 3) activar nuevos según objetivo (poseidon va aparte)
    if (activeH < ACTIVE_TARGET_H) {
      const need = ACTIVE_TARGET_H - activeH;
      const candidates = this.nodes
        .filter(n => !n.isActive && n.kind !== "jelly" && n.kind !== "poseidon" && this.timeSec >= (n.nextSpawn || 0))
        .sort((a, b) => (a.nextSpawn || 0) - (b.nextSpawn || 0));
      for (let i = 0; i < Math.min(need, candidates.length); i++) this.activateNode(candidates[i], w, h);
    }
    if (activeJ < ACTIVE_TARGET_J) {
      const need = ACTIVE_TARGET_J - activeJ;
      const candidates = this.nodes
        .filter(n => !n.isActive && n.kind === "jelly" && this.timeSec >= (n.nextSpawn || 0))
        .sort((a, b) => (a.nextSpawn || 0) - (b.nextSpawn || 0));
      for (let i = 0; i < Math.min(need, candidates.length); i++) this.activateNode(candidates[i], w, h);
    }

    // Activación de poseidones de respaldo
    const poseidonCandidates = this.nodes
      .filter(n => !n.isActive && n.kind === "poseidon" && this.timeSec >= (n.nextSpawn || 0))
      .sort((a, b) => (a.nextSpawn || 0) - (b.nextSpawn || 0));
    for (const n of poseidonCandidates) this.activateNode(n, w, h);
  }

  private clearStage() {
    if (!this.stage) return;
    this.stage.removeChildren();
    this.nodes.forEach(n => {
      n.sprite?.destroy();
      if (n.label) n.label.destroy({ children: true });
    });
    this.nodes = [];
  }

  public destroy(): void {
    try {
      if (this.app && this.tickBound) this.app.ticker.remove(this.tickBound);

      const view = this.app?.view as HTMLCanvasElement | undefined;
      if (view && this.ctxLostHandler)     view.removeEventListener("webglcontextlost", this.ctxLostHandler as any);
      if (view && this.ctxRestoredHandler) view.removeEventListener("webglcontextrestored", this.ctxRestoredHandler as any);
      if (this.visHandler) document.removeEventListener("visibilitychange", this.visHandler);

      this.clearStage();

      this.seahorseTex?.destroy(true);
      this.fishTex?.destroy(true);
      this.doryTex?.destroy(true);
      this.turtleTex?.destroy(true);
      this.rayTex?.destroy(true);
      this.swordTex?.destroy(true);
      this.dolphinTex?.destroy(true); // ← NUEVO
      this.hammerTex?.destroy(true);
      this.sharkTex?.destroy(true);
      this.poseidon1Tex?.destroy(true);
      this.poseidon2Tex?.destroy(true);
      this.poseidon3Tex?.destroy(true);
      this.poseidon4Tex?.destroy(true);
      this.unknownPoseidonTex?.destroy(true);
      for (const tex of this.advisorPoseidonTex.values()) tex.destroy(true);
      this.advisorPoseidonTex.clear();
      this.advisorPoseidonBaseW.clear();
      this.jellyTex?.destroy(true);
      this.app?.destroy(true);
    } catch { /* noop */ }
  }
}
