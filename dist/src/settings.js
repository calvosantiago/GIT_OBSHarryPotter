/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
"use strict";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
var FormattingSettingsCard = formattingSettings.SimpleCard;
var FormattingSettingsModel = formattingSettings.Model;
/**
 * Data Point Formatting Card
 */
class DataPointCardSettings extends FormattingSettingsCard {
    constructor() {
        super(...arguments);
        this.defaultColor = new formattingSettings.ColorPicker({
            name: "defaultColor",
            displayName: "Default color",
            value: { value: "" }
        });
        this.showAllDataPoints = new formattingSettings.ToggleSwitch({
            name: "showAllDataPoints",
            displayName: "Show all",
            value: true
        });
        this.fill = new formattingSettings.ColorPicker({
            name: "fill",
            displayName: "Fill",
            value: { value: "" }
        });
        this.fillRule = new formattingSettings.ColorPicker({
            name: "fillRule",
            displayName: "Color saturation",
            value: { value: "" }
        });
        this.fontSize = new formattingSettings.NumUpDown({
            name: "fontSize",
            displayName: "Text Size",
            value: 12
        });
        this.name = "dataPoint";
        this.displayName = "Data colors";
        this.slices = [this.defaultColor, this.showAllDataPoints, this.fill, this.fillRule, this.fontSize];
    }
}
/**
* visual settings model class
*
*/
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    constructor() {
        super(...arguments);
        // Create formatting settings model formatting cards
        this.dataPointCard = new DataPointCardSettings();
        this.cards = [this.dataPointCard];
    }
}
//# sourceMappingURL=settings.js.map