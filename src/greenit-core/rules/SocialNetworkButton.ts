import { Measures } from "../../cli-core/analysis";
import { rulesManager } from "../rulesManager";
import { getOfficialSocialButtonFormUrl } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "SocialNetworkButton",
    comment: "",
    detailComment: "",

    check: function (measures: Measures) {
        let nbSocialNetworkButton = 0;
        const socialNetworks = new Array<string>();
        if (measures.entries.length) measures.entries.forEach(entry => {
            const officalSocialButton = getOfficialSocialButtonFormUrl(entry.request.url);
            if (officalSocialButton.length > 0) {
                if (!socialNetworks.includes(officalSocialButton)) {
                    socialNetworks.push(officalSocialButton);
                    this.detailComment += chrome.i18n.getMessage("rule_SocialNetworkButton_detailComment", officalSocialButton) + "<br>";
                    nbSocialNetworkButton++;
                }
            }
        });
        if (nbSocialNetworkButton > 0) {
            this.complianceLevel = 'C';
            this.comment = chrome.i18n.getMessage("rule_SocialNetworkButton_Comment", String(nbSocialNetworkButton));
        }
    }
}, "harReceived");