import { ChromeDevtoolsMessage, harFromMessages } from 'chrome-har';
import { Entry } from 'har-format';
import fs from 'node:fs';
import path from 'node:path';
import { Browser, Page, Protocol, PuppeteerLifeCycleEvent } from 'puppeteer';
import { PuppeteerHar } from 'puppeteer-har';
import {
    Headers,
    LoginInformations,
    Options,
    PageInformations,
    PageInformationsAction,
    PageWait,
    Proxy,
} from '../commands/analyse';
import { sizes } from '../conf/sizes';
import { ImageMeasures } from '../greenit-core/analyseFrameCore';
import { launchAnalyse } from '../greenit-core/greenpanel';
import { Rule } from '../greenit-core/rulesManager';
import { Translator } from './translator';
import { createProgressBar, Grade } from './utils';

type NetworkEvent = ChromeDevtoolsMessage &  {
    method: unknown;
    params: {
        response: unknown;
        requestId: unknown;
        initiator?: {
            type?: string;
            stack?: {
                callFrames?: { url: string }[];
            };
        };
    };
};

type PageEvent = ChromeDevtoolsMessage;

type PuppeteerHarCompleted = PuppeteerHar & {
    network_events: NetworkEvent[];
    page_events: PageEvent[];
    response_body_promises: unknown[];
    saveResponse: boolean;
};

type AnalyseScenarioOptions = Pick<Options, 'device' | 'timeout' | 'language'> & {
    tabId: number;
    tryNb?: number;
    proxy: Proxy | undefined;
    headers: Headers | undefined;
    index: number;
};

type Report = {
    name: string;
    path: string;
};

class ScenarioResult {
    pages = new Array<CurrentPage>();
    success = false;
    nbBestPracticesToCorrect = 0;
    date = '';
    pageInformations: PageInformations = { url: '' };
    tryNb = 0;
    tabId = 0;
    index = 0;
    url = '';
}

/**
 * Analyse a scenario
 */
async function analyseScenario(
    browser: Browser,
    pageInformations: PageInformations,
    options: AnalyseScenarioOptions,
    translator: Translator,
    pageLoadingLabel: string | undefined
): Promise<ScenarioResult> {
    let scenarioResult = new ScenarioResult();

    const TIMEOUT = options.timeout;
    const TAB_ID = options.tabId;
    const TRY_NB = options.tryNb || 1;
    const DEVICE = options.device || 'desktop';
    const LANGUAGE = options.language;

    try {
        const page = await browser.newPage();

        // configure proxy in page browser
        if (options.proxy) {
            const { user, password } = options.proxy;
            await page.authenticate({ username: user, password: password });
        }

        // configure headers http
        if (options.headers) {
            await page.setExtraHTTPHeaders(options.headers);
        }

        await page.setViewport(sizes[DEVICE]);

        // disabling cache
        await page.setCacheEnabled(false);

        // Execute actions on page (click, text, ...)
        const pages = await startActions(page, pageInformations, TIMEOUT, translator, pageLoadingLabel);

        scenarioResult.pages = pages;
        scenarioResult.success = true;
        scenarioResult.nbBestPracticesToCorrect = 0;

        // Compute number of times where best practices are not respected
        // for (let key in scenarioResult.bestPractices) {
        //     if ((scenarioResult.bestPractices[key].complianceLevel || 'A') !== 'A') {
        //         scenarioResult.nbBestPracticesToCorrect++;
        //     }
        // }
    } catch (error) {
        console.error(`Error while analyzing URL ${pageInformations.url} : `, error);
        scenarioResult.success = false;
    }
    const date = new Date();
    scenarioResult.date = `${date.toLocaleDateString(LANGUAGE)} ${date.toLocaleTimeString(LANGUAGE)}`;
    scenarioResult.pageInformations = pageInformations;
    scenarioResult.tryNb = TRY_NB;
    scenarioResult.tabId = TAB_ID;
    scenarioResult.index = options.index;
    scenarioResult.url = pageInformations.url;

    return scenarioResult;
}

async function waitPageLoading(page: Page, pageInformations: PageWait, timeout: number) {
    if (pageInformations.waitForSelector) {
        await page.locator(pageInformations.waitForSelector).setTimeout(timeout).wait();
    } else if (pageInformations.waitForXPath) {
        await page.locator(`::-p-xpath(${pageInformations.waitForXPath})`).setTimeout(timeout).wait();
    } else if (isValidWaitForNavigation(pageInformations.waitForNavigation)) {
        await page.waitForNavigation({
            waitUntil: pageInformations.waitForNavigation,
            timeout: timeout,
        });
    } else if (pageInformations.waitForTimeout) {
        await waitForTimeout(pageInformations.waitForTimeout);
    }
}

function waitForTimeout(milliseconds: number) {
    return new Promise((r) => setTimeout(r, milliseconds));
}

function isValidWaitForNavigation(
    waitUntilParam: PuppeteerLifeCycleEvent | undefined
): waitUntilParam is PuppeteerLifeCycleEvent {
    return (
        waitUntilParam !== undefined &&
        ('load' === waitUntilParam ||
            'domcontentloaded' === waitUntilParam ||
            'networkidle0' === waitUntilParam ||
            'networkidle2' === waitUntilParam)
    );
}

class CurrentPage {
    name: string | undefined = undefined;
    bestPractices: BestPractices = {};
    nbRequest = 0;
    responsesSize = 0;
    responsesSizeUncompress = 0;
    url = '';
    actions: Measures[] = [];
}

/**
 * Execute scenario configured actions
 */
async function startActions(
    page: Page,
    pageInformations: PageInformations,
    timeout: number,
    translator: Translator,
    pageLoadingLabel: string | undefined
): Promise<CurrentPage[]> {
    //get har file
    const pptrHar = new PuppeteerHar(page) as PuppeteerHarCompleted;
    await pptrHar.start();

    // do first action : go to the URL
    await doFirstAction(page, pageInformations, timeout);

    // do initial snapshot of data before actions
    let measures = await doAnalysis(page, pptrHar, pageLoadingLabel, translator);

    let actionsResultsForAPage = new Array<Measures>();
    actionsResultsForAPage.push(measures);

    let currentPage = new CurrentPage();
    currentPage.name = measures.name;
    currentPage.bestPractices = measures.bestPractices;
    currentPage.nbRequest = measures.nbRequest;
    currentPage.responsesSize = measures.responsesSize;
    currentPage.responsesSizeUncompress = measures.responsesSizeUncompress;

    const pagesResults = new Array<CurrentPage>();
    const actions = pageInformations.actions;
    if (actions) {
        for (const [index, action] of actions.entries()) {
            let actionName = action?.name || (index + 1).toString();

            // Add some wait in order to prevent green-it script to cancel future measure
            // default timeout : 1000ms
            const timeoutBefore =
                action.timeoutBefore !== undefined && action.timeoutBefore > 0 ? action.timeoutBefore : 1000;
            await waitForTimeout(timeoutBefore);

            currentPage.url = page.url();

            if (action.pageChange) {
                // Save page analyse
                currentPage.actions = actionsResultsForAPage;
                pagesResults.push({ ...currentPage });

                // Reinit variables
                actionsResultsForAPage = [];
                currentPage = new CurrentPage();
                currentPage.name = actionName;
                currentPage.nbRequest = 0;
                currentPage.responsesSize = 0;
                currentPage.responsesSizeUncompress = 0;

                // Clean up HAR history
                pptrHar.network_events = [];
                pptrHar.response_body_promises = [];
            }

            try {
                // Do asked action
                await doAction(page, action, timeout);
            } finally {
                if (action.screenshot) {
                    await takeScreenshot(page, action.screenshot);
                }
            }

            measures = await doAnalysis(page, pptrHar, actionName, translator);
            currentPage.bestPractices = measures.bestPractices;

            // Statistics of current page = statistics of last action (e.g. statistics sum of all actions)
            currentPage.nbRequest = measures.nbRequest;
            currentPage.responsesSize = measures.responsesSize;
            currentPage.responsesSizeUncompress = measures.responsesSizeUncompress;

            actionsResultsForAPage.push(measures);
        }
    }

    currentPage.url = page.url();
    currentPage.actions = actionsResultsForAPage;
    pagesResults.push(currentPage);

    await pptrHar.stop();
    page.close();

    return pagesResults;
}

async function doFirstAction(page: Page, pageInformations: PageInformations, timeout: number): Promise<void> {
    try {
        //go to url
        await page.goto(pageInformations.url, { timeout: timeout });

        // waiting for page to load
        await waitPageLoading(page, pageInformations, timeout);
    } finally {
        // Take screenshot (even if the page fails to load)
        if (pageInformations.screenshot) {
            await takeScreenshot(page, pageInformations.screenshot);
        }
    }
}

async function doAction(
    page: Page,
    action: PageInformationsAction,
    timeout: number
): Promise<void> {
    switch (action.type) {
        case 'click':
            await page.click(action.element);
            await waitPageLoading(page, action, timeout);
            break;

        case 'text':
            await page.type(action.element, action.content, { delay: 100 });
            await waitPageLoading(page, action, timeout);
            break;

        case 'select':
            await page.select(action.element, ...action.values);
            await waitPageLoading(page, action, timeout);
            break;

        case 'scroll':
            await scrollToBottom(page);
            await waitPageLoading(page, action, timeout);
            break;

        case 'press':
            await page.keyboard.press(action.key);
            await waitPageLoading(page, action, timeout);
            break;
    }
}

function isNetworkEventGeneratedByAnalysis(
    initiator: PuppeteerHarCompleted['network_events'][number]['params']['initiator']
): boolean {
    return (
        initiator?.type === 'script' &&
        (initiator?.stack?.callFrames?.some((callFrame) => callFrame.url.includes('greenItBundle.js')) ?? false)
    );
}

type BestPractices = { [k: string]: Rule }

type Measures = {
    url: string;
    domSize: number;
    nbRequest: number;
    responsesSize: number;
    responsesSizeUncompress: number;
    ecoIndex: number;
    grade: Grade;
    waterConsumption: number;
    greenhouseGasesEmission: number;
    pluginsNumber: number;
    printStyleSheetsNumber: number;
    inlineStyleSheetsNumber: number;
    emptySrcTagNumber: number;
    inlineJsScriptsNumber: number;
    imagesResizedInBrowser: ImageMeasures[];
    bestPractices: BestPractices;
    name?: string;
    entries: Entry[];
    dataEntries: Entry[];
};

type FrameResourceExtended = Protocol.Page.FrameResource & {
  content: string
}

async function doAnalysis(
    page: Page,
    pptrHar: PuppeteerHarCompleted,
    name: string | undefined,
    translator: Translator
): Promise<Measures> {
    // remove network events generated by the analysis (remove all events that have initiator.type=script generated by greenItBundle.js)
    pptrHar.network_events = pptrHar.network_events.filter(
        (network_event) => !isNetworkEventGeneratedByAnalysis(network_event?.params?.initiator)
    );

    //get ressources
    const { log } = await harStatus(pptrHar);
    const client = await page.createCDPSession();
    const ressourceTree = await client.send('Page.getResourceTree');
    const resources = new Array<FrameResourceExtended>();
    for  (const resource of ressourceTree.frameTree.resources) {
        // get the content of every ressource
        const { content } = await client.send('Page.getResourceContent', { frameId: ressourceTree.frameTree.frame.id, url: resource.url });
        
        resources.push({
            ...resource,
            content: content
        });
    }
    await client.detach();

    await injectChromeObjectInPage(page, translator);

    //add script, get run, then remove it to not interfere with the analysis
    const script = await page.addScriptTag({
        path: path.join(__dirname, '../../dist/greenItBundle.js'),
    });
    await script.evaluate((x) => x.remove());

    //pass node object to browser
    await page.evaluate((x) => {
        globalThis.har = x;
    }, log);
    await page.evaluate((x) => {
        globalThis.resources = x;
    }, resources);

    //launch analyse
    // const now = Date.now();
    // if (now - lastAnalyseStartingTime < 1000) {
    //     debug(() => 'Ignore click');
    // } else {
    const measures = await page.evaluate(() => launchAnalyse());

    if (name) {
        measures.name = name;
    }

    return measures;
    // }
}

async function injectChromeObjectInPage(page: Page, translator: Translator): Promise<void> {
    // replace chrome.i18n.getMessage call by i18n custom implementation working in page
    // fr is default catalog
    await page.evaluate(
        (language_array) =>
            ((globalThis as unknown as Record<string, unknown>).chrome = {
                i18n: {
                    getMessage: function (message: string, parameters: string | string[] = []) {
                        return (language_array[message] ?? '').replaceAll('%s', function () {
                            // parameters is string or array
                            return Array.isArray(parameters) ? parameters.shift() ?? '' : parameters;
                        });
                    },
                },
            }),
        translator.getCatalog()
    );
}

async function harStatus(pptrHar: PuppeteerHarCompleted) {
    await Promise.all(pptrHar.response_body_promises);
    return harFromMessages(pptrHar.page_events.concat(pptrHar.network_events), {
        includeTextFromResponseBody: pptrHar.saveResponse,
    });
}

async function scrollToBottom(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            const distance = 400;
            const timeoutBetweenScroll = 1500;
            let totalHeight = 0;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve(undefined);
                }
            }, timeoutBetweenScroll);
        });
    });
}

async function takeScreenshot(page: Page, screenshotPath: string): Promise<void> {
    // create screenshot folder if not exists
    const folder = path.dirname(screenshotPath);
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    // remove old screenshot
    if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
    }
    // take screenshot
    await page.screenshot({ path: screenshotPath });
}

async function login(browser: Browser, loginInformations: LoginInformations, options: Options): Promise<void> {
    //use the tab that opens with the browser
    const page = (await browser.pages())[0] as Page;
    //go to login page
    await page.goto(loginInformations.url);
    //ensure page is loaded
    await page.waitForSelector(loginInformations.loginButtonSelector);
    //simulate user waiting before typing login and password
    await waitForTimeout(1000);
    //complete fields
    for (const field of loginInformations.fields) {
        await page.type(field.selector, field.value);
        await waitForTimeout(500);
    }
    //simulate user waiting before clicking on button
    await waitForTimeout(1000);
    //click login button
    await page.click(loginInformations.loginButtonSelector);

    if (loginInformations.screenshot) {
        await takeScreenshot(page, loginInformations.screenshot);
    }
    //make sure to not wait for the full authentification procedure
    // waiting for page to load
    await waitPageLoading(page, loginInformations, options.timeout);
}

async function createJsonReports(
    browser: Browser,
    pagesInformations: PageInformations[],
    options: Options,
    proxy: Proxy | undefined,
    headers: Headers | undefined,
    translator: Translator,
): Promise<Report[]> {
    //Timeout for an analysis
    const TIMEOUT = options.timeout;
    //Concurent tab
    const MAX_TAB = options.max_tab;
    //Nb of retry before dropping analysis
    const RETRY = options.retry;
    //Device to emulate
    const DEVICE = options.device;
    //Language
    const LANGUAGE = options.language;
    // JSON output directory
    const JSON_SUBRESULTS_DIRECTORY = path.join(__dirname, '../../', path.dirname(options.report_output_file), 'json');

    //initialise progress bar
    const progressBar = createProgressBar(options, pagesInformations.length + 2, 'Analysing', 'Analysing ...');
    let asyncFunctions = new Array<Promise<ScenarioResult>>();
    let results: ScenarioResult;
    let resultId = 1;
    let index = 0;
    const reports = new Array<Report>();
    let writeList = [];

    const convert = new Array<number>(MAX_TAB).fill(0);

    for (let i = 0; i < MAX_TAB; i++) {
        convert[i] = i;
    }

    //create directory for subresults
    if (fs.existsSync(JSON_SUBRESULTS_DIRECTORY)) {
        fs.rmSync(JSON_SUBRESULTS_DIRECTORY, { recursive: true });
    }
    fs.mkdirSync(JSON_SUBRESULTS_DIRECTORY, { recursive: true });

    //Set translator language
    const pageLoadingLabel = translator.translate('pageLoading');

    //Asynchronous analysis with MAX_TAB open simultaneously to json
    for (let i = 0; i < MAX_TAB && index < pagesInformations.length; i++) {
        asyncFunctions.push(
            analyseScenario(
                browser,
                pagesInformations[index] as PageInformations,
                {
                    device: DEVICE,
                    timeout: TIMEOUT,
                    tabId: i,
                    proxy: proxy,
                    headers: headers,
                    index: index,
                    language: LANGUAGE,
                },
                translator,
                pageLoadingLabel
            )
        );
        index++;
    }

    while (asyncFunctions.length != 0) {
        results = await Promise.race(asyncFunctions);
        if (!results.success && results.tryNb <= RETRY) {
            const start = convert[results.tabId] ?? 0;
            asyncFunctions.splice(
                start,
                1,
                analyseScenario(
                    browser,
                    results.pageInformations,
                    {
                        device: DEVICE,
                        timeout: TIMEOUT,
                        tabId: results.tabId,
                        tryNb: results.tryNb + 1,
                        proxy: proxy,
                        headers: headers,
                        index: results.index,
                        language: LANGUAGE,
                    },
                    translator,
                    pageLoadingLabel
                )
            ); // convert is NEEDED, variable size array
        } else {
            let filePath = path.resolve(JSON_SUBRESULTS_DIRECTORY, `${resultId}.json`);
            writeList.push(fs.promises.writeFile(filePath, JSON.stringify(results)));
            reports.push({ name: `${resultId}`, path: filePath });
            if (progressBar) {
                progressBar.tick();
            } else {
                console.log(`${resultId}/${pagesInformations.length}`);
            }
            resultId++;
            if (index == pagesInformations.length) {
                const start = convert[results.tabId] ?? 0;
                asyncFunctions.splice(start, 1); // convert is NEEDED, varialbe size array
                for (let i = results.tabId + 1; i < convert.length; i++) {
                    convert[i] = convert[i] ?? 0 - 1;
                }
            } else {
                asyncFunctions.splice(
                    results.tabId,
                    1,
                    analyseScenario(
                        browser,
                        pagesInformations[index] as PageInformations,
                        {
                            device: DEVICE,
                            timeout: TIMEOUT,
                            tabId: results.tabId,
                            proxy: proxy,
                            headers: headers,
                            index,
                            language: LANGUAGE,
                        },
                        translator,
                        pageLoadingLabel
                    )
                ); // No need for convert, fixed size array
                index++;
            }
        }
    }

    //wait for all file to be written
    await Promise.all(writeList);
    //results to xlsx file
    if (progressBar) {
        progressBar.tick();
    } else {
        console.log('Analyse done');
    }

    return reports;
}

export {
    createJsonReports,
    login,
    ScenarioResult
};

export type {
    FrameResourceExtended, Measures, Report
};
