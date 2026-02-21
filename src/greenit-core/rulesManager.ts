/*
 *  Copyright (C) 2019  didierfred@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Protocol } from "puppeteer";
import { Measures } from "../cli-core/analysis";
import { Grade } from "../cli-core/utils";

type ResourceContent = {
    url: string;
    type: Protocol.Network.ResourceType;
    content: string,
}

type Rule = {
    complianceLevel: Grade;
    id: string;
    comment: string;
    detailComment: string;
    check: (this: Rule, measures: Measures, resourceContent?: ResourceContent) => void;
    initialize?: () => void;
    [k: string]: any;
}

type EventName = 'harReceived' | 'frameMeasuresReceived' | 'resourceContentReceived';

class RulesManager {
    private readonly rulesId = new Array<string>();
    private readonly rules = new Map<string, Rule>();
    /** For each event, list the rule.id */
    private readonly eventListeners = new Map<EventName, string[]>();
    private readonly notCompatibleRules = [];

    constructor() {
        this.eventListeners.set('harReceived', []);
        this.eventListeners.set('frameMeasuresReceived', []);
        this.eventListeners.set('resourceContentReceived', []);
    }

    registerRule(rule: Rule, eventListener: EventName) {
        this.rulesId.push(rule.id);
        this.rules.set(rule.id, rule);
        let events = this.eventListeners.get(eventListener);
        if (events) events.push(rule.id);
    }

    getRulesId() {
        return this.rulesId;
    }

    getRulesNotCompatibleWithCurrentBrowser() {
        return this.notCompatibleRules;
    }

    initializeRules() {
        this.rules.forEach((rule) => {
            // for certains rules need an initalization , method not implemented in all rules
            if (rule.initialize) rule.initialize();
        });
    }

    sendEvent(event: EventName, measures: Measures, resourceContent?: ResourceContent) {
        const rulesIds = this.eventListeners.get(event);
        if (rulesIds) {
            rulesIds.forEach((ruleID) => {
                this.checkRule(ruleID, measures, resourceContent);
            });
        }
    }

    checkRule(ruleId: string, measures: Measures, resourceContent?: ResourceContent) {
        const rule = this.getRule(ruleId);
        if (rule) {
            rule.check(measures, resourceContent);
        }
    }

    getRule(rule: string) {
        return this.rules.get(rule);
    }

    getAllRules() {
        return this.rules;
    }
}

const rulesManager = new RulesManager();

export {
    RulesManager,
    rulesManager
};

export type {
    ResourceContent,
    Rule
};
