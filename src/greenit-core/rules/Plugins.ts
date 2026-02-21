import { Measures } from "../../cli-core/analysis";
import { rulesManager } from "../rulesManager";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "Plugins",
    comment: "",
    detailComment: "",
  
    check: function (measures: Measures) {
      if (measures.pluginsNumber > 0) {
        this.complianceLevel = 'C';
        this.comment = chrome.i18n.getMessage("rule_Plugins_Comment", String(measures.pluginsNumber));
      }
    }
  }, "frameMeasuresReceived");