import { Measures } from "../../cli-core/analysis";
import { rulesManager } from "../rulesManager";
import { getDomainFromUrl } from "../utils";

rulesManager.registerRule({
    complianceLevel: 'A',
    id: "DomainsNumber",
    comment: "",
    detailComment: "",

    check: function (measures: Measures) {
        const domains = new Array<string>();
        if (measures.entries.length) measures.entries.forEach(entry => {
            const domain = getDomainFromUrl(entry.request.url);
            if (domain && !domains.includes(domain)) {
                domains.push(domain);
            }
        });
        if (domains.length > 2) {
            if (domains.length === 3) this.complianceLevel = 'B';
            else this.complianceLevel = 'C';
        }
        domains.forEach(domain => {
            this.detailComment += domain + "<br>";
        });

        this.comment = chrome.i18n.getMessage("rule_DomainsNumber_Comment", String(domains.length));
    }
}, "harReceived");