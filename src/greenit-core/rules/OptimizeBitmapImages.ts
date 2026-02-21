import { Measures } from "../../cli-core/analysis";
import { rulesManager } from "../rulesManager";
import { getImageTypeFromResource, getMinOptimisationGainsForImage } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "OptimizeBitmapImages",
    comment: "",
    detailComment: "",
  
    check: function (measures: Measures) {
      let nbImagesToOptimize = 0;
      let totalMinGains = 0;
      if (measures.entries) {
        measures.entries.forEach(entry => {
          if (entry.response) {
            const imageType = getImageTypeFromResource(entry);
            if (imageType !== "") {
              const myImage = new Image();
              myImage.src = entry.request.url;
              // needed to access object in the function after
    
              myImage.addEventListener('load', (e) => {
                const img = e.currentTarget as HTMLImageElement
                const minGains = getMinOptimisationGainsForImage(img.width * img.height, entry.response.content.size, imageType);
                if (minGains > 500) { // exclude small gain 
                  nbImagesToOptimize++;
                  totalMinGains += minGains;
                  this.detailComment += chrome.i18n.getMessage("rule_OptimizeBitmapImages_DetailComment", [
                    img.src + " , " + Math.round(entry.response.content.size / 1000),
                    img.width + "x" + img.height,String(Math.round(minGains / 1000))
                  ]) + "<br>";
                }
                if (nbImagesToOptimize > 0) {
                  if (totalMinGains < 50000) this.complianceLevel = 'B';
                  else this.complianceLevel = 'C';
                  this.comment = chrome.i18n.getMessage("rule_OptimizeBitmapImages_Comment", [String(nbImagesToOptimize), String(Math.round(totalMinGains / 1000))]);
                  // showEcoRuleOnUI(this.rule);
                }
              });
            }
          }
        });
      }
    }
  }, "harReceived");