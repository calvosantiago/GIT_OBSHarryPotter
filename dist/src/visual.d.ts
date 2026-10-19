import powerbi from "powerbi-visuals-api";
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
export declare class Visual implements IVisual {
    private root;
    private app?;
    private stage?;
    private texture?;
    private sim?;
    private nodes;
    private width;
    private height;
    private FISH_SIZE;
    private COLLISION_PAD;
    private initialized;
    private lastOptions?;
    constructor(options: VisualConstructorOptions);
    private initPixi;
    update(options: VisualUpdateOptions): Promise<void>;
    private readAdvisors;
    private clearStage;
    private stopSimulation;
    private reconcileNodesWithData;
    private renderSprites;
    private startOrUpdateSimulation;
}
