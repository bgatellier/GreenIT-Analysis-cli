import { Measures } from "../../cli-core/analysis";
import { ResourceContent, rulesManager } from "../rulesManager";
import { isMinified } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "MinifiedJs",
    comment: "",
    detailComment: "",
    totalJsSize: 0,
    minifiedJsSize: 0,

    check: function (_measures: Measures, resourceContent?: ResourceContent) {
        if (resourceContent?.type === "Script") {
            this.totalJsSize += resourceContent.content.length;
            if (isMinified(resourceContent.content)) {
                this.minifiedJsSize += resourceContent.content.length;
            } else {
                this.detailComment += chrome.i18n.getMessage("rule_MinifiedJs_DetailComment",resourceContent.url) + '<br>';
            }
            const percentMinifiedJs = this.minifiedJsSize / this.totalJsSize * 100;
            this.complianceLevel = 'A';
            if (percentMinifiedJs < 90) this.complianceLevel = 'C';
            else if (percentMinifiedJs < 95) this.complianceLevel = 'B';
            this.comment = chrome.i18n.getMessage("rule_MinifiedJs_Comment", String(Math.round(percentMinifiedJs * 10) / 10));
        }
    }
}, "resourceContentReceived");
