import { Measures } from "../../cli-core/analysis";
import { ImageMeasures } from "../analyseFrameCore";
import { rulesManager } from "../rulesManager";

function isRelevant(entry: ImageMeasures) {
    // Very small images could be download even if not display  as it may be icons 
    if (entry.naturalWidth * entry.naturalHeight < 10000) return false;
    if (entry.clientWidth === 0 && entry.clientHeight === 0) return true;
    return false;
}

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "ImageDownloadedNotDisplayed",
    comment: "",
    detailComment: "",
    imageDownloadedNotDisplayedNumber: 0,
    imgAnalysed: new Set(),

    // need to get a new map , otherwise it's share between instance
    initialize: function () {
        this.imgAnalysed = new Set();
    },

    check: function (measures: Measures) {
        measures.imagesResizedInBrowser.forEach(entry => {
            if (!this.imgAnalysed.has(entry.src) && isRelevant(entry)) { // Do not count two times the same picture
                this.detailComment += chrome.i18n.getMessage("rule_ImageDownloadedNotDisplayed_DetailComment",[entry.src,`${entry.naturalWidth}x${entry.naturalHeight}`]) + '<br>';
                this.imgAnalysed.add(entry.src);
                this.imageDownloadedNotDisplayedNumber += 1;
            }
        });
        if (this.imageDownloadedNotDisplayedNumber > 0) this.complianceLevel = 'C';
        this.comment = chrome.i18n.getMessage("rule_ImageDownloadedNotDisplayed_Comment", String(this.imageDownloadedNotDisplayedNumber));
    }
}, "frameMeasuresReceived");