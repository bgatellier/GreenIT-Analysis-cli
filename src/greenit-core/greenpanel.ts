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

import { Entry } from "har-format";
import { Measures } from "../cli-core/analysis";
import { PageAnalysis, start_analyse_core } from "./analyseFrameCore";
import { computeEcoIndex, computeGreenhouseGasesEmissionfromEcoIndex, computeWaterConsumptionfromEcoIndex, getEcoIndexGrade } from "./ecoIndex";
import { ResourceContent, RulesManager, rulesManager } from "./rulesManager";
import { debug, isDataResource, isNetworkResource } from "./utils";

function computeEcoIndexMeasures(measures: Measures) {
    measures.ecoIndex = computeEcoIndex(
        measures.domSize,
        measures.nbRequest,
        Math.round(measures.responsesSize / 1000)
    );
    measures.waterConsumption = computeWaterConsumptionfromEcoIndex(measures.ecoIndex);
    measures.greenhouseGasesEmission = computeGreenhouseGasesEmissionfromEcoIndex(measures.ecoIndex);
    measures.grade = getEcoIndexGrade(measures.ecoIndex);
}

function launchAnalyse(): Measures {
    rulesManager.initializeRules();
    const measuresAcquisition = new MeasuresAcquisition(rulesManager);
    measuresAcquisition.aggregateFrameMeasures(start_analyse_core());
    measuresAcquisition.startMeasuring();
    return measuresAcquisition.getMeasures();
}

class MeasuresAcquisition {
    private readonly measures: Measures;
    private readonly localRulesChecker;
    private nbGetHarTry = 0;

    constructor(rulesChecker: RulesManager) {
        this.localRulesChecker = rulesChecker

       this.measures = {
            url: '',
            domSize: 0,
            nbRequest: 0,
            responsesSize: 0,
            responsesSizeUncompress: 0,
            ecoIndex: 100,
            grade: 'A',
            waterConsumption: 0,
            greenhouseGasesEmission: 0,
            pluginsNumber: 0,
            printStyleSheetsNumber: 0,
            inlineStyleSheetsNumber: 0,
            emptySrcTagNumber: 0,
            inlineJsScriptsNumber: 0,
            imagesResizedInBrowser: [],
            bestPractices: {},
            entries: [],
            dataEntries: [],
        };
    };

    startMeasuring() {
        this.getNetworkMeasure();
        this.getResourcesMeasure();
        this.measures.bestPractices = Object.fromEntries(this.localRulesChecker.getAllRules());
    };

    getMeasures(): Measures {
        return this.measures
    }

    aggregateFrameMeasures(frameMeasures: PageAnalysis) {
        this.measures.domSize += frameMeasures.domSize;
        computeEcoIndexMeasures(this.measures);

        this.measures.pluginsNumber += frameMeasures.pluginsNumber;

        this.measures.printStyleSheetsNumber += frameMeasures.printStyleSheetsNumber;
        if (this.measures.inlineStyleSheetsNumber < frameMeasures.inlineStyleSheetsNumber)
            this.measures.inlineStyleSheetsNumber = frameMeasures.inlineStyleSheetsNumber;
        this.measures.emptySrcTagNumber += frameMeasures.emptySrcTagNumber;
        if (frameMeasures.inlineJsScript.length > 0) {
            const resourceContent: ResourceContent = {
                url: 'inline js',
                type: 'Script',
                content: frameMeasures.inlineJsScript,
            };
            this.localRulesChecker.sendEvent('resourceContentReceived', this.measures, resourceContent);
        }
        if (this.measures.inlineJsScriptsNumber < frameMeasures.inlineJsScriptsNumber)
            this.measures.inlineJsScriptsNumber = frameMeasures.inlineJsScriptsNumber;

        this.measures.imagesResizedInBrowser = frameMeasures.imagesResizedInBrowser;

        this.localRulesChecker.sendEvent('frameMeasuresReceived', this.measures);
    }

    getNetworkMeasure() {
        console.log('Start network measure...');
        // only account for network traffic, filtering resources embedded through data urls
        let entries = globalThis.har.entries.filter((entry) => isNetworkResource(entry));

        // Get the "mother" url
        if (entries.length > 0) this.measures.url = (entries[0] as Entry).request.url;
        else if (this.nbGetHarTry < 1) {
            // Bug with firefox  when we first get har.entries when starting the plugin , we need to ask again to have it
            debug(() => 'No entries, try again to get HAR in 1s');
            this.nbGetHarTry++;
            setTimeout(this.getNetworkMeasure, 1000);
        }

        this.measures.entries = entries;
        this.measures.dataEntries = globalThis.har.entries.filter((entry) => isDataResource(entry)); // embeded data urls

        if (entries.length) {
            this.measures.nbRequest = entries.length;
            entries.forEach((entry) => {
                // If chromium :
                // _transferSize represent the real data volume transfert
                // while content.size represent the size of the page which is uncompress
                if (entry.response._transferSize) {
                    this.measures.responsesSize += entry.response._transferSize;
                    this.measures.responsesSizeUncompress += entry.response.content.size;
                } else if (entry.response.content.size) {
                    // In firefox , entry.response.content.size can sometimes be undefined
                     this.measures.responsesSize += entry.response.content.size;
                    debug(() => `entry size = ${entry.response.content.size} , responseSize = ${this.measures.responsesSize}`);
                }
            });
            this.localRulesChecker.sendEvent('harReceived', this.measures);

            computeEcoIndexMeasures(this.measures);
        }
    }

    getResourcesMeasure() {
        globalThis.resources.forEach((resource) => {
            if (resource.url.startsWith('file') || resource.url.startsWith('http')) {
                if (resource.type === 'Script' && !resource.url.includes('script/analyseFrame.js') || resource.type === 'Stylesheet' || resource.type === 'Image') {

                    this.localRulesChecker.sendEvent('resourceContentReceived', this.measures, {
                        url: resource.url,
                        type: resource.type,
                        content: resource.content,
                    });
                }
            }
        });
    }
}

export {
    launchAnalyse
};
