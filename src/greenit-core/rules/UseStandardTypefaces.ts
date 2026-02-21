import { Measures } from "../../cli-core/analysis";
import { rulesManager } from "../rulesManager";
import { isFontResource } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "UseStandardTypefaces",
    comment: "",
    detailComment: "",
  
    check: function (measures: Measures) {
      let totalFontsSize = 0;
      if (measures.entries.length) measures.entries.forEach(entry => {
        if (isFontResource(entry) && (entry.response.content.size > 0)) {
          totalFontsSize += entry.response.content.size;
          this.detailComment += entry.request.url + " " + Math.round(entry.response.content.size / 1000) + "KB <br>";
        }
      });
      if (measures.dataEntries.length) measures.dataEntries.forEach(entry => {
        if (isFontResource(entry) && (entry.response.content.size > 0)) {
          totalFontsSize += entry.response.content.size;
          const url_toshow = entry.request.url.length > 80 ? entry.request.url.substring(0, 80) + "..." : entry.request.url;
          this.detailComment += url_toshow + " " + Math.round(entry.response.content.size / 1000) + "KB <br>";
        }
      });
      if (totalFontsSize > 10000) this.complianceLevel = 'C';
      else if (totalFontsSize > 0) this.complianceLevel = 'B';
      if (totalFontsSize > 0) this.comment = chrome.i18n.getMessage("rule_UseStandardTypefaces_Comment", String(Math.round(totalFontsSize / 1000)));
    }
  }, "harReceived");