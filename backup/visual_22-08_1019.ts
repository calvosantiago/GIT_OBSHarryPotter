import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;

import * as PIXI from "pixi.js";

declare const require: any;
// Recomendación: archivo grande (e.g., ./assets/eagle@2x.png de 1024px)
const eagleUrl: string = require("./assets/eagle.png");

/** ====== Ajustes visuales ====== **/
const SIZE_MIN_PX = 110;     // tamaño mínimo del águila en píxeles
const SIZE_MAX_PX = 200;     // tamaño máximo (si tu PNG es 1024px, esto va sobrado sin perder nitidez)
const SPEED_MIN = 10;        // px/seg
const SPEED_MAX = 300;       // px/seg
const WANDER_STRENGTH = 1.2; // radianes/seg (zigzag suave)
const SEP_RADIUS = 60;       // radio de separación entre águilas
const SEP_FORCE = 140;       // fuerza de separación
const BORDER_MARGIN = 40;    // margen invisible para wrap
const FRICTION = 0.98;       // rozamiento (0.98 ≈ suave)

/** RNG seguro */
function rand01(): number {
  const a = new Uint32Array(1);
  if ((window as any)?.crypto?.getRandomValues) {
    (window as any).crypto.getRandomValues(a);
    return a[0] / 0xffffffff;
  }
  return Math.random();
}
function randRange(a: number, b: number) { return a + (b - a) * rand01(); }

interface NodeDatum {
  id: string;
  sprite?: PIXI.Sprite;
  x: number; y: number;
  vx: number; vy: number;
  dir: number;            // dirección actual (radianes)
  speed: number;          // velocidad objetivo (px/s)
  sizePx: number;         // tamaño visual objetivo (diámetro aprox)
}

export class Visual implements IVisual {
  private host!: powerbi.extensibility.visual.IVisualHost;
  private root!: HTMLElement;
  private debugEl!: HTMLPreElement;

  private app?: PIXI.Application;
  private stage?: PIXI.Container;
  private pixiReady = false;
  private lastPixiError = "";

  private eagleTex?: PIXI.Texture;
  private texReady = false;
  private baseTexW = 512; // se actualiza al cargar

  private nodes: NodeDatum[] = [];
  private tickBound?: (delta: number) => void;

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
    this.loadTexture();
  }

  private initPixi(width: number, height: number) {
    try {
      const app = new PIXI.Application({
        width,
        height,
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

      // ticker de animación (se añade una sola vez)
      this.tickBound = (delta: number) => this.onTick(delta);
      this.app.ticker.add(this.tickBound);

      this.updateDebug(width, height, 0, false, false);
    } catch (e: any) {
      this.pixiReady = false;
      this.lastPixiError = String(e?.message || e || "init failed");
      this.updateDebug(width, height, 0, false, false);
    }
  }

  private async loadTexture() {
    try {
      const tex = PIXI.Texture.from(eagleUrl);
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
      this.baseTexW = (tex.baseTexture as any).realWidth ?? tex.width ?? 512;

      this.eagleTex = tex;
      this.texReady = true;
    } catch {
      this.texReady = false;
    }
  }

  private updateDebug(w: number, h: number, advisorsCount: number, hasCat = false, hasVals = false) {
    const extra = this.lastPixiError ? `, pixiErr="${this.lastPixiError}"` : "";
    this.debugEl.textContent =
      `update(): ${w}x${h}, advisors=${advisorsCount}, pixiReady=${this.pixiReady}, texReady=${this.texReady}${extra}\n` +
      `cat=${hasCat} vals=${hasVals}`;
  }

  public update(options: VisualUpdateOptions): void {
    const w = Math.max(10, Math.floor(options.viewport.width || 0));
    const h = Math.max(10, Math.floor(options.viewport.height || 0));
    if (this.app) this.app.renderer.resize(w, h);

    const dv = options.dataViews?.[0];
    const hasCat = !!dv?.categorical?.categories?.length;
    const hasVals = !!dv?.categorical?.values?.length;
    const { advisors } = this.extractAdvisors(dv);

    if (!this.pixiReady || !this.stage) {
      this.updateDebug(w, h, advisors.length, hasCat, hasVals);
      return;
    }

    this.updateDebug(w, h, advisors.length, hasCat, hasVals);

    if (advisors.length === 0) {
      this.clearStage();
      return;
    }

    this.upsertNodes(advisors, w, h);
    this.ensureSprites(); // crea sprites nuevos si faltan y ajusta escala
  }

  private extractAdvisors(dv: DataView | undefined): { advisors: string[] } {
    if (!dv || !dv.categorical) return { advisors: [] };
    const cat = dv.categorical.categories?.[0];
    const advisors = (cat?.values || [])
      .map(v => String(v ?? "").trim())
      .filter(s => s.length > 0);
    return { advisors };
  }

  private upsertNodes(advisors: string[], w: number, h: number) {
    const byId = new Map(this.nodes.map(n => [n.id, n] as const));
    const next: NodeDatum[] = [];
    const seen = new Set<string>();

    for (const id of advisors) {
      seen.add(id);
      let n = byId.get(id);
      if (!n) {
        n = {
          id,
          x: randRange(BORDER_MARGIN, w - BORDER_MARGIN),
          y: randRange(BORDER_MARGIN, h - BORDER_MARGIN),
          vx: randRange(-40, 40),
          vy: randRange(-40, 40),
          dir: randRange(-Math.PI, Math.PI),
          speed: randRange(SPEED_MIN, SPEED_MAX),
          sizePx: randRange(SIZE_MIN_PX, SIZE_MAX_PX)
        };
      }
      next.push(n);
    }

    // elimina sprites que ya no existen
    for (const [id, n] of byId) {
      if (!seen.has(id)) {
        n.sprite?.parent?.removeChild(n.sprite);
        n.sprite?.destroy();
      }
    }

    this.nodes = next;
  }

  private ensureSprites() {
    if (!this.stage) return;
    this.nodes.forEach(n => {
      if (!n.sprite && this.texReady && this.eagleTex) {
        const s = new PIXI.Sprite(this.eagleTex);
        s.anchor.set(0.5);
        s.x = n.x;
        s.y = n.y;
        // ¡No upscale! → nítido
        const scale = Math.min(1, n.sizePx / Math.max(1, this.baseTexW));
        s.scale.set(scale);
        this.stage!.addChild(s);
        n.sprite = s;
      } else if (n.sprite) {
        const scale = Math.min(1, n.sizePx / Math.max(1, this.baseTexW));
        n.sprite.scale.set(scale);
      }
    });
  }

  /** ====== Animación continua tipo “volar” ====== **/
  private onTick(delta: number) {
    if (!this.app || !this.stage || this.nodes.length === 0) return;

    const dt = this.app.ticker.deltaMS / 1000; // segundos
    const w = this.root.clientWidth || 1;
    const h = this.root.clientHeight || 1;

    // 1) vagabundeo (wander): variación suave de dirección y ajuste de velocidad
    for (const n of this.nodes) {
      n.dir += randRange(-WANDER_STRENGTH, WANDER_STRENGTH) * dt;
      const ax = Math.cos(n.dir) * n.speed;
      const ay = Math.sin(n.dir) * n.speed;
      n.vx += ax * dt * 0.2;
      n.vy += ay * dt * 0.2;

      // fricción
      n.vx *= FRICTION;
      n.vy *= FRICTION;

      // límite de velocidad
      const v = Math.hypot(n.vx, n.vy);
      const vmax = n.speed;
      if (v > vmax) {
        const s = vmax / (v || 1);
        n.vx *= s; n.vy *= s;
      }
    }

    // 2) separación simple O(n^2) (22 nodos es OK)
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i], b = this.nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < SEP_RADIUS) {
          const push = (SEP_FORCE * (SEP_RADIUS - dist) / SEP_RADIUS) * dt;
          const ux = dx / dist, uy = dy / dist;
          a.vx -= ux * push; a.vy -= uy * push;
          b.vx += ux * push; b.vy += uy * push;
        }
      }
    }

    // 3) integrar posición + wrap
    for (const n of this.nodes) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;

      if (n.x < -BORDER_MARGIN) n.x = w + BORDER_MARGIN;
      if (n.x > w + BORDER_MARGIN) n.x = -BORDER_MARGIN;
      if (n.y < -BORDER_MARGIN) n.y = h + BORDER_MARGIN;
      if (n.y > h + BORDER_MARGIN) n.y = -BORDER_MARGIN;

      if (n.sprite) {
        n.sprite.x = n.x;
        n.sprite.y = n.y;
        // orienta el sprite según la dirección de movimiento
        n.sprite.rotation = Math.atan2(n.vy, n.vx);
      }
    }
  }

  private clearStage() {
    if (!this.stage) return;
    this.stage.removeChildren();
    this.nodes.forEach(n => n.sprite?.destroy());
    this.nodes = [];
  }

  public destroy(): void {
    try {
      if (this.app && this.tickBound) this.app.ticker.remove(this.tickBound);
      this.clearStage();
      this.eagleTex?.destroy(true);
      this.app?.destroy(true);
    } catch { /* noop */ }
  }
}
