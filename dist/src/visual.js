import * as PIXI from "pixi.js";
import { forceSimulation, forceX, forceY, forceCollide, forceManyBody } from "d3-force";
const fishUrl = require("./assets/fish.svg"); // Ensure this path is correct
export class Visual {
    constructor(options) {
        this.nodes = [];
        this.width = 300;
        this.height = 150;
        this.initialized = false;
        this.root = document.createElement("div");
        this.root.className = "visual-host";
        options.element.appendChild(this.root);
        this.initPixi();
    }
    async initPixi() {
        if (this.app)
            return;
        try {
            this.app = await PIXI.Application.init({
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                backgroundColor: 0x01262a, // Dark blue for debugging
                backgroundAlpha: 1,
                width: this.width,
                height: this.height
            });
            this.root.appendChild(this.app.canvas);
            this.stage = new PIXI.Container();
            this.app.stage.addChild(this.stage);
            // Test shape to confirm rendering
            const test = new PIXI.Graphics();
            test.beginFill(0x00FF00); // Green square
            test.drawRect(100, 100, 100, 100);
            test.endFill();
            this.stage.addChild(test);
            try {
                this.texture = PIXI.Texture.from(fishUrl);
                console.log("Texture loaded:", this.texture.width > 0 && this.texture.height > 0);
            }
            catch (e) {
                console.error("Failed to load fish.svg:", e);
                this.texture = undefined; // Trigger fallback
            }
            this.initialized = true;
            if (this.lastOptions)
                this.update(this.lastOptions);
        }
        catch (e) {
            console.error("PIXI init failed:", e);
        }
    }
    async update(options) {
        this.lastOptions = options;
        if (!this.initialized) {
            console.log("Waiting for PIXI initialization");
            return;
        }
        const vp = options && options.viewport ? options.viewport : { width: 300, height: 150 };
        this.width = Math.max(80, Math.floor(vp.width));
        this.height = Math.max(80, Math.floor(vp.height));
        this.FISH_SIZE = Math.min(this.width, this.height) / 10; // ~200px for 2000px
        this.COLLISION_PAD = this.FISH_SIZE / 8;
        if (this.app) {
            this.app.renderer.resize(this.width, this.height);
        }
        const dataView = options.dataViews && options.dataViews[0];
        const advisors = this.readAdvisors(dataView);
        console.log("Advisors:", advisors);
        if (advisors.length === 0) {
            console.warn("No advisors found, clearing stage");
            this.clearStage();
            this.stopSimulation();
            return;
        }
        this.reconcileNodesWithData(advisors);
        this.renderSprites();
        this.startOrUpdateSimulation();
    }
    readAdvisors(dv) {
        var _a, _b;
        const result = [];
        console.log("DataView:", JSON.stringify(dv, null, 2));
        const cat = (_a = dv === null || dv === void 0 ? void 0 : dv.categorical) === null || _a === void 0 ? void 0 : _a.categories;
        console.log("Categories:", JSON.stringify(cat, null, 2));
        if (!cat || cat.length === 0) {
            console.warn("No categories found in DataView");
            return result;
        }
        const advisorsCol = cat[0];
        const values = (_b = advisorsCol === null || advisorsCol === void 0 ? void 0 : advisorsCol.values) !== null && _b !== void 0 ? _b : [];
        console.log("Advisor values:", values);
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v === null || v === undefined)
                continue;
            result.push(String(v));
        }
        return result;
    }
    clearStage() {
        if (!this.stage)
            return;
        this.stage.removeChildren().forEach((child) => {
            child.destroy();
        });
    }
    stopSimulation() {
        if (this.sim) {
            this.sim.stop();
        }
    }
    reconcileNodesWithData(advisors) {
        const wantedIds = new Set(advisors);
        const remaining = [];
        for (const n of this.nodes) {
            if (wantedIds.has(n.id)) {
                remaining.push(n);
                wantedIds.delete(n.id);
            }
            else if (n.sprite && this.stage) {
                this.stage.removeChild(n.sprite);
                n.sprite.destroy();
                n.sprite = undefined;
            }
        }
        const array = new Uint32Array(2);
        for (const id of wantedIds) {
            window.crypto.getRandomValues(array); // Fix linter error
            remaining.push({
                id,
                r: this.FISH_SIZE / 2,
                x: (array[0] / 0xFFFFFFFF) * this.width,
                y: (array[1] / 0xFFFFFFFF) * this.height
            });
        }
        this.nodes = remaining;
    }
    renderSprites() {
        var _a, _b;
        if (!this.stage)
            return;
        for (const n of this.nodes) {
            if (!n.sprite) {
                let s;
                if (this.texture && this.texture.width > 0 && this.texture.height > 0) {
                    s = new PIXI.Sprite(this.texture);
                    s.anchor.set(0.5);
                    s.width = this.FISH_SIZE;
                    s.height = this.FISH_SIZE;
                }
                else {
                    console.warn("Falling back to red circle due to invalid texture");
                    s = new PIXI.Graphics();
                    s.beginFill(0xFF0000); // Red circle for debugging
                    s.drawCircle(0, 0, this.FISH_SIZE / 2);
                    s.endFill();
                }
                s.x = (_a = n.x) !== null && _a !== void 0 ? _a : (this.width / 2);
                s.y = (_b = n.y) !== null && _b !== void 0 ? _b : (this.height / 2);
                this.stage.addChild(s);
                n.sprite = s;
            }
            else {
                n.sprite.width = this.FISH_SIZE;
                n.sprite.height = this.FISH_SIZE;
            }
        }
    }
    startOrUpdateSimulation() {
        if (this.nodes.length === 0) {
            this.stopSimulation();
            return;
        }
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const collide = forceCollide()
            .radius((d) => d.r + this.COLLISION_PAD)
            .iterations(2);
        if (this.sim) {
            this.sim.nodes(this.nodes)
                .force("x", forceX(centerX).strength(0.05))
                .force("y", forceY(centerY).strength(0.05))
                .force("collide", collide)
                .force("charge", forceManyBody().strength(-this.FISH_SIZE * 3))
                .alpha(0.9)
                .restart();
        }
        else {
            this.sim = forceSimulation(this.nodes)
                .force("x", forceX(centerX).strength(0.05))
                .force("y", forceY(centerY).strength(0.05))
                .force("collide", collide)
                .force("charge", forceManyBody().strength(-this.FISH_SIZE * 3))
                .alpha(1)
                .on("tick", () => {
                console.log("Nodes:", this.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })));
                for (const n of this.nodes) {
                    if (!n.sprite)
                        continue;
                    const r = n.r;
                    const minX = r, maxX = this.width - r;
                    const minY = r, maxY = this.height - r;
                    const nx = (typeof n.x === "number") ? n.x : this.width / 2;
                    const ny = (typeof n.y === "number") ? n.y : this.height / 2;
                    n.sprite.x = Math.max(minX, Math.min(maxX, nx));
                    n.sprite.y = Math.max(minY, Math.min(maxY, ny));
                }
            });
        }
    }
}
//# sourceMappingURL=visual.js.map