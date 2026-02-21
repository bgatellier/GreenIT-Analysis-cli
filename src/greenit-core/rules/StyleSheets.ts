import { Measures } from "../../cli-core/analysis";
import { rulesManager } from "../rulesManager";
import { getResponseHeaderFromResource } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "StyleSheets",
    comment: "",
    detailComment: "",
  
    check: function (measures: Measures) {
      const styleSheets = new Array<string>();
      if (measures.entries.length) measures.entries.forEach(entry => {
        if (getResponseHeaderFromResource(entry, "content-type").toLowerCase().includes('text/css')) {
          if (!styleSheets.includes(entry.request.url)) {
            styleSheets.push(entry.request.url);
            this.detailComment += entry.request.url + "<br>";
          }
        }
      });
      if (styleSheets.length > 2) {
        if (styleSheets.length === 3) this.complianceLevel = 'B';
        else this.complianceLevel = 'C';
        this.comment = chrome.i18n.getMessage("rule_StyleSheets_Comment", String(styleSheets.length));
      }
    }
  }, "harReceived");