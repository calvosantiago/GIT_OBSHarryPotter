import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import DataView = powerbi.DataView;

import * as PIXI from "pixi.js";

declare const require: any;

/** ====== Fotos de asesores ======
 * Se cargan automáticamente todos los .png de assets/advisors/ y de sus
 * subcarpetas (una por equipo: A1, A2, B1...); la carpeta solo organiza.
 * El nombre del archivo identifica al asesor (se normaliza igual que el nombre
 * que llega de Power BI: sin tildes, minúsculas, separadores -> espacio):
 *   "Agustin Oregioni"  <->  agustin-oregioni.png / agustin_oregioni.png
 * Las fotos van en la MISMA orientación: mirando hacia la DERECHA.
 * Si un asesor no tiene foto se usa unknown.png.
 */
const advisorCtx = require.context("../assets/advisors", true, /\.png$/i);
const UNKNOWN_KEY = "unknown";
const ADVISOR_URLS: Record<string, string> = {};
for (const k of advisorCtx.keys() as string[]) {
  const mod = advisorCtx(k);
  const url: string = typeof mod === "string" ? mod : mod?.default;
  const base = k.replace(/^.*[\\/]/, "").replace(/\.png$/i, "");
  ADVISOR_URLS[normalizeAdvisorName(base)] = url;
}

/** ====== Ajustes globales ====== **/
// Tamaño de cada asesor (igual para todos), como los peces: se escala por ANCHO.
// 180 px equivale al tiburón (180–200); otras especies: tortuga 130, espada 130–140,
// delfín 140–150. El alto máximo evita que una foto más
// "vertical" se salga de su carril.
const ADVISOR_WIDTH_PX  = 180;
const ADVISOR_MAX_H_PX  = 180;

// Bordes y física
const OFF_PAD          = 80;
const FRICTION         = 0.995;
const THRUST           = 3.0;
const RETARGET_MIN     = 2.5;
const RETARGET_MAX     = 6.5;

// Velocidad (px/s): las matrículas aceleran un poco, sin cambiar el tamaño
const SPEED_MIN        = 70;
const SPEED_MAX        = 130;

// Headway por carril/dirección (evita pelotones/"choques")
const HEADWAY_BASE     = 40;
const HEADWAY_K        = 1.0;    // × (ancho prev + ancho cur) / 2
const HEADWAY_FORCE    = 4.0;

// Concurrencia objetivo (asesores volando a la vez)
const ACTIVE_TARGET    = 10;

// Respawn
const RESPAWN_MIN      = 5;
const RESPAWN_MAX      = 12;

// Escalonado inicial
const SPAWN_STAGGER_S  = 12;

// Etiquetas
const NAME_FONT_SIZE   = 14;
const VALUE_FONT_SIZE  = 12;
const LABEL_LINE_GAP   = 2;
const LABEL_GAP        = 3;
const LABEL_SAFE_K     = 1.3;

// Z-order
const Z_SPRITE         = 300;
const Z_LABEL          = 350;

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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface NodeDatum {
  id: string;
  value?: number;

  sprite?: PIXI.Sprite;

  label?: PIXI.Container;
  nameText?: PIXI.Text;
  valText?: PIXI.Text;

  x: number; y: number;
  vx: number; vy: number;

  laneIdx: number;
  laneOffset?: number;
  sizePx: number;      // alto real del asesor en pantalla
  widthPx: number;     // ancho real del asesor en pantalla
  baseScale: number;

  speedT: number;      // 0..1 según matrículas relativas
  speedMag: number;
  speedMul: number;
  tNext: number;

  isActive: boolean;
  nextSpawn: number;
  dir: 1 | -1;
}

export class Visual implements IVisual {
  private host!: powerbi.extensibility.visual.IVisualHost;
  private root!: HTMLElement;
  private debugEl!: HTMLPreElement;

  private app?: PIXI.Application;
  private stage?: PIXI.Container;
  private pixiReady = false;
  private lastPixiError = "";

  private advisorTex = new Map<string, PIXI.Texture>();
  private texReady = false;

  private nodes: NodeDatum[] = [];
  private tickBound?: (delta: number) => void;

  // Layout vertical
  private laneCenters: number[] = [];
  private laneCount = 1;
  private spriteH = ADVISOR_MAX_H_PX;
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
  private async loadOne(url: string): Promise<PIXI.Texture | undefined> {
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
      return tex;
    } catch {
      return undefined;
    }
  }

  // Carga en PARALELO de todas las fotos de assets/advisors
  private async loadTextures() {
    const entries = Object.entries(ADVISOR_URLS);
    const loaded = await Promise.all(
      entries.map(async ([name, url]) => ({ name, tex: await this.loadOne(url) }))
    );
    for (const { name, tex } of loaded) {
      if (tex) this.advisorTex.set(name, tex);
    }
    this.texReady = this.advisorTex.size > 0;

    if (this.stage && this.nodes?.length) {
      this.ensureSpritesAndLabels();
      this.needsRebuild = true;
    }
  }

  // foto del asesor, o unknown.png si todavía no existe
  private texFor(n: NodeDatum): PIXI.Texture | undefined {
    return this.advisorTex.get(normalizeAdvisorName(n.id)) || this.advisorTex.get(UNKNOWN_KEY);
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

    this.upsertNodes(items, h);          // crea/actualiza nodos + layout
    this.ensureSpritesAndLabels();       // prepara sprites/labels
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

  /** Layout vertical seguro: tantos carriles como quepan (máx. count/2) */
  private computeLayout(h: number, count: number) {
    this.spriteH = ADVISOR_MAX_H_PX;

    const labelH = (NAME_FONT_SIZE + LABEL_LINE_GAP + VALUE_FONT_SIZE) * LABEL_SAFE_K;
    const half = this.spriteH * 0.5;

    this.topMargin = Math.ceil(half + 6);
    this.bottomMargin = Math.ceil(half + LABEL_GAP + labelH + 6);

    const avail = Math.max(1, h - this.topMargin - this.bottomMargin);
    const laneH = this.spriteH + LABEL_GAP + labelH;
    const fit = Math.max(1, Math.floor(avail / laneH) + 1);
    const wanted = Math.max(1, Math.ceil(count / 2));
    this.laneCount = Math.min(wanted, fit);

    const step = avail / this.laneCount;
    this.laneCenters = Array.from({ length: this.laneCount }, (_, i) => this.topMargin + step * (i + 0.5));
  }

  /** Alta/actualización de nodos */
  private upsertNodes(items: Array<{ id: string; value?: number }>, h: number) {
    const byId = new Map(this.nodes.map(n => [n.id, n] as const));

    this.computeLayout(h, items.length);

    // Matrículas relativas -> velocidad
    const defined = items.map(i => i.value).filter((v): v is number => v !== undefined);
    const vMin = defined.length ? Math.min(...defined) : 0;
    const vMax = defined.length ? Math.max(...defined) : 0;

    // Orden estable para carriles
    const shuffled = items.map(it => ({ it, h: hash32(it.id) })).sort((a, b) => (a.h - b.h));
    const laneById = new Map<string, number>();
    shuffled.forEach((row, pos) => laneById.set(row.it.id, pos % this.laneCount));

    const now = this.timeSec || 0;
    const next: NodeDatum[] = [];
    const seen = new Set<string>();

    for (const it of items) {
      seen.add(it.id);

      const prev = byId.get(it.id);
      const effValue = (it.value === undefined && prev) ? prev.value : it.value;
      const laneIdx = clamp(laneById.get(it.id) ?? 0, 0, Math.max(0, this.laneCount - 1));

      const speedT = (effValue === undefined || vMax === vMin) ? 0.5 : clamp((effValue - vMin) / (vMax - vMin), 0, 1);
      const speedMul = prev?.speedMul ?? randRange(0.9, 1.1);
      const baseSpeed = lerp(SPEED_MIN, SPEED_MAX, speedT) * speedMul;

      let n = prev;
      if (!n) {
        n = {
          id: it.id,
          value: effValue,
          x: 0, y: 0,
          vx: 0, vy: 0,
          laneIdx,
          laneOffset: 0,
          sizePx: this.spriteH,
          widthPx: ADVISOR_WIDTH_PX,
          baseScale: 1,
          speedT,
          speedMag: baseSpeed,
          speedMul,
          tNext: randRange(RETARGET_MIN, RETARGET_MAX),
          isActive: false,
          nextSpawn: now + ((hash32(it.id) % 1000) / 1000) * SPAWN_STAGGER_S,
          dir: rand01() > 0.5 ? 1 : -1
        };
      } else {
        n.value = effValue;
        n.sizePx = this.spriteH;
        n.laneIdx = laneIdx;
        n.speedT = speedT;
        n.speedMag = baseSpeed;
      }

      next.push(n);
    }

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
      fill: "#f6e7b4", fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: NAME_FONT_SIZE, fontWeight: "600",
      stroke: "#1a0f05", strokeThickness: 3, align: "center"
    });
    const valueStyle = new PIXI.TextStyle({
      fill: "#e2c46a", fontFamily: "Segoe UI, Arial, sans-serif",
      fontSize: VALUE_FONT_SIZE, fontWeight: "500",
      stroke: "#1a0f05", strokeThickness: 3, align: "center"
    });

    this.nodes.forEach(n => {
      const desiredTex = this.texFor(n);

      // Se escala por ANCHO (como los peces), sin pasar del alto máximo.
      const texH = desiredTex?.height;
      const texW = desiredTex?.width;
      const s = (texH && texW) ? Math.min(ADVISOR_WIDTH_PX / texW, ADVISOR_MAX_H_PX / texH) : 0.001;
      n.baseScale = s > 0 ? s : 0.001;
      n.widthPx = (texW ? texW * n.baseScale : ADVISOR_WIDTH_PX);
      n.sizePx  = (texH ? texH * n.baseScale : this.spriteH);

      // SPRITE
      if (!n.sprite) {
        if (desiredTex) {
          const sp = new PIXI.Sprite(desiredTex);
          sp.anchor.set(0.5);
          sp.x = n.x; sp.y = n.y;
          sp.scale.set(n.baseScale * n.dir, n.baseScale);
          sp.visible = false;
          sp.zIndex = Z_SPRITE;
          this.stage!.addChild(sp);
          n.sprite = sp;
        }
      } else {
        if (desiredTex && n.sprite.texture !== desiredTex) n.sprite.texture = desiredTex;
        const sign = Math.sign(n.sprite.scale.x) || 1;
        n.sprite.scale.set(Math.abs(n.baseScale) * sign, n.baseScale);
        n.sprite.zIndex = Z_SPRITE;
      }

      // LABEL
      if (!n.label) {
        const container = new PIXI.Container();
        container.zIndex = Z_LABEL;
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
        n.label.zIndex = Z_LABEL;
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

  /** Activar: el asesor entra volando por un borde (las fotos miran a la derecha) */
  private activateNode(n: NodeDatum, w: number, h: number) {
    n.isActive = true;
    n.dir = rand01() > 0.5 ? 1 : -1;

    const avail = Math.max(1, h - this.topMargin - this.bottomMargin);
    const step = avail / Math.max(1, this.laneCount);
    const yCenter = this.laneCenters[n.laneIdx] ?? (h / 2);
    const jitter = clamp(randRange(-step * 0.25, step * 0.25), -step * 0.3, step * 0.3);
    n.laneOffset = jitter;

    const pad = OFF_PAD + n.widthPx * 0.5;
    n.y = yCenter + (n.laneOffset || 0);
    if (n.dir === 1) { n.x = -pad;      n.vx =  Math.abs(n.speedMag); }
    else             { n.x =  w + pad;  n.vx = -Math.abs(n.speedMag); }
    n.vy = 0;

    if (n.sprite) {
      n.sprite.visible = true;
      n.sprite.x = n.x; n.sprite.y = n.y;
      n.sprite.scale.x = Math.abs(n.baseScale) * n.dir;
      n.sprite.scale.y = n.baseScale;
    }
    if (n.label) {
      n.label.visible = !!n.sprite;
      n.label.x = n.x; n.label.y = n.y + n.sizePx * 0.5 + LABEL_GAP;
      n.label.zIndex = Z_LABEL;
    }
  }

  private deactivateNode(n: NodeDatum) {
    n.isActive = false;

    // Respawn proporcional al tiempo de cruce
    const w = this.root.clientWidth || 1;
    const travelT = (w + 2 * OFF_PAD) / Math.max(1, n.speedMag);
    const base = randRange(0.35, 0.65);
    n.nextSpawn = this.timeSec + clamp(base * travelT, RESPAWN_MIN, RESPAWN_MAX);

    if (this.laneCount > 1) {
      const delta = 1 + Math.floor(rand01() * (this.laneCount - 1));
      n.laneIdx = (n.laneIdx + delta) % this.laneCount;
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
        n.speedMag = lerp(SPEED_MIN, SPEED_MAX, n.speedT) * (n.speedMul || 1.0);
        n.tNext = randRange(RETARGET_MIN, RETARGET_MAX);
      }
    }

    // 1) mover activos
    let active = 0;

    for (const n of this.nodes) {
      if (!n.isActive) continue;

      const targetY = (this.laneCenters[n.laneIdx] ?? (h / 2)) + (n.laneOffset || 0);
      const dy = targetY - n.y;
      n.vy = dy * 8.0 * dt;
      n.y += n.vy;

      n.vx *= FRICTION;
      const targetVx = (n.dir === 1 ? 1 : -1) * (n.speedMag || 60);
      n.vx += (targetVx - n.vx) * THRUST * dt;

      n.x += n.vx * dt;

      const pad = OFF_PAD + n.widthPx * 0.5;
      if ((n.dir === 1 && n.x > w + pad) || (n.dir === -1 && n.x < -pad)) {
        this.deactivateNode(n);
        continue;
      }
      active++;

      // Sprite / Label
      if (n.sprite) {
        n.sprite.x = n.x; n.sprite.y = n.y;
        n.sprite.scale.x = Math.abs(n.baseScale) * n.dir;
        n.sprite.scale.y = n.baseScale;
      }
      if (n.label) {
        n.label.x = n.x; n.label.y = n.y + n.sizePx * 0.5 + LABEL_GAP;
        n.label.zIndex = Z_LABEL;
        n.label.visible = !!n.isActive && !!n.sprite;
      }
    }

    // 2) Headway: separación entre asesores del mismo carril y dirección
    const lanesFwd = new Map<number, NodeDatum[]>();
    const lanesBwd = new Map<number, NodeDatum[]>();
    for (const n of this.nodes) {
      if (!n.isActive) continue;
      const map = n.dir === 1 ? lanesFwd : lanesBwd;
      const arr = map.get(n.laneIdx) || [];
      arr.push(n);
      map.set(n.laneIdx, arr);
    }
    for (const [, arr] of lanesFwd) {
      arr.sort((a, b) => a.x - b.x);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1], cur = arr[i];
        const minGap = HEADWAY_BASE + HEADWAY_K * 0.5 * (prev.widthPx + cur.widthPx);
        const desiredX = prev.x + minGap;
        const e = desiredX - cur.x;
        if (e > 0) cur.vx += e * HEADWAY_FORCE * dt;
      }
    }
    for (const [, arr] of lanesBwd) {
      arr.sort((a, b) => b.x - a.x);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1], cur = arr[i];
        const minGap = HEADWAY_BASE + HEADWAY_K * 0.5 * (prev.widthPx + cur.widthPx);
        const desiredX = prev.x - minGap;
        const e = cur.x - desiredX;
        if (e > 0) cur.vx -= e * HEADWAY_FORCE * dt;
      }
    }

    // 3) activar nuevos según objetivo
    if (active < ACTIVE_TARGET) {
      const need = ACTIVE_TARGET - active;
      const candidates = this.nodes
        .filter(n => !n.isActive && this.timeSec >= (n.nextSpawn || 0))
        .sort((a, b) => (a.nextSpawn || 0) - (b.nextSpawn || 0));
      for (let i = 0; i < Math.min(need, candidates.length); i++) this.activateNode(candidates[i], w, h);
    }
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

      for (const tex of this.advisorTex.values()) tex.destroy(true);
      this.advisorTex.clear();
      this.app?.destroy(true);
    } catch { /* noop */ }
  }
}
