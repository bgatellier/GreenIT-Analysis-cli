import { Measures } from "../../cli-core/analysis";
import { ResourceContent, rulesManager } from "../rulesManager";
import { isSvgUrl, isSvgOptimized } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "OptimizeSvg",
    comment: "",
    detailComment: "",
    totalSizeToOptimize: 0,
    totalResourcesToOptimize: 0,

    check: function (_measures: Measures, resourceContent?: ResourceContent) {
      if (resourceContent?.type === 'Image' && isSvgUrl(resourceContent.url)) {
        // code is in base64 , decode base64 data with atob
        if (!isSvgOptimized(atob(resourceContent.content))) {
          this.detailComment += chrome.i18n.getMessage("rule_OptimizeSvg_detailComment", [resourceContent.url,String(Math.round(resourceContent.content.length / 100) / 10)]) + '<br>';
          this.totalSizeToOptimize += resourceContent.content.length;
          this.totalResourcesToOptimize++;
        }

        if (this.totalSizeToOptimize > 0) {
          this.complianceLevel = this.totalSizeToOptimize < 20000 ? 'B' : 'C';
          this.comment = chrome.i18n.getMessage("rule_OptimizeSvg_Comment", String(this.totalResourcesToOptimize));
        }
      }
    }
  }, "resourceContentReceived");