import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { KeyInput, PuppeteerLifeCycleEvent } from 'puppeteer';
import YAML, { YAMLError } from 'yaml';
import { Locale, translator } from '../cli-core/translator';
import { Device } from '../conf/sizes';
const createJsonReports = require('../cli-core/analysis.js').createJsonReports;
const login = require('../cli-core/analysis.js').login;
const create_global_report = require('../cli-core/reportGlobal.js').create_global_report;
const create_XLSX_report = require('../cli-core/reportExcel.js').create_XLSX_report;
const create_html_report = require('../cli-core/reportHtml.js').create_html_report;
const writeToInflux = require('../cli-core/influxdb').write;

type PageWait = {
    waitForSelector?: string;
    waitForXPath?: string;
    waitForNavigation?: PuppeteerLifeCycleEvent;
    waitForTimeout?: number;
};

type ActionClick = {
    type: 'click'
    element: string
}

type ActionText = {
    type: 'text'
    element: string
    content: string
}

type ActionSelect = {
    type: 'select'
    element: string
    values: string[];
}

type ActionScroll = {
    type: 'scroll'
}

type ActionPress = {
    type: 'press'
    key: KeyInput;
}

type Action = ActionClick | ActionText | ActionSelect | ActionScroll | ActionPress

type PageInformationsAction = PageWait & Action & {
    name?: string;
    pageChange?: boolean;
    timeoutBefore?: number;
    screenshot?: string;
};

type PageInformations = PageWait & {
    name?: string;
    url: string;
    actions?: PageInformationsAction[];
    screenshot?: string;
};

type LoginInformations = PageWait & {
    url: string;
    loginButtonSelector: string;
    fields: Array<{
        selector: string;
        value: string;
    }>;
    screenshot?: string;
};

type Options = {
    url_input_file: string
    proxy?: string
    headers?: string
    format: 'html' | 'xlsx' | 'influxdb' | 'influxdbhtml'
    report_output_file: string
    headless: boolean
    language: Locale
    login?: string
    timeout: number;
    max_tab: number;
    retry: number;
    device: Device;
    ci: boolean;
}

type Proxy = {
    server: string
    user: string
    password: string
    bypass: boolean
}

type Headers = {
    accept: string
    'accept-encoding': 'string'
    'accept-language': string
}

//launch core
async function analyse_core(options: Options) {
    const URL_YAML_FILE = path.resolve(options.url_input_file);
    //Get list of pages to analyze and its informations
    let pagesInformations;
    try {
        pagesInformations = YAML.parse(fs.readFileSync(URL_YAML_FILE).toString());
    } catch (error) {
        if (error instanceof YAMLError) {
            throw new Error(` url_input_file : "${URL_YAML_FILE}" is not a valid YAML file: ${error.code} at ${JSON.stringify(
                error.linePos
            )}.`);
        }
    }

    let browserArgs = [
        '--no-sandbox', // can't run inside docker without
        '--disable-setuid-sandbox', // but security issues
    ];

    // Add proxy conf in browserArgs
    let proxy: Proxy | undefined = undefined
    if (options.proxy) {
        proxy = readProxy(options.proxy);
        browserArgs.push(`--proxy-server=${proxy.server}`);
        if (proxy.bypass) {
            browserArgs.push(`--proxy-bypass-list=${proxy.bypass}`);
        }
    }

    // Read headers http file
    let headers: Headers | undefined = undefined;
    if (options.headers) {
        headers = readHeaders(options.headers);
    }

    // Get and check report format
    const reportFormat = getReportFormat(options.format, options.report_output_file);
    if (!reportFormat) {
        throw new Error('Format not supported. Use --format option or report file extension to define a supported extension.');
    }

    //start browser
    const browser = await puppeteer.launch({
        headless: options.headless,
        args: browserArgs,
        // Keep gpu horsepower in headless
        ignoreDefaultArgs: ['--disable-gpu'],
        acceptInsecureCerts: true,
    });

    // init translator
    translator.setLocale(options.language);

    //handle analyse
    let reports;
    try {
        //handle login
        if (options.login) {
            const LOGIN_YAML_FILE = path.resolve(options.login);
            let loginInfos;
            try {
                loginInfos = YAML.parse(fs.readFileSync(LOGIN_YAML_FILE).toString());
            } catch (error) {
                if (error instanceof YAMLError) {
                    throw new Error(` --login : "${LOGIN_YAML_FILE}" is not a valid YAML file: ${error.code} at ${JSON.stringify(
                        error.linePos
                    )}.`);
                }
            }
            await login(browser, loginInfos, options);
        }
        //analyse
        reports = await createJsonReports(browser, pagesInformations, options, proxy, headers, translator);
    } finally {
        //close browser
        await browser.close();
    }
    //create report
    let reportObj = await create_global_report(reports, { ...options, proxy }, translator);
    if (reportFormat === 'influxdbhtml') {
        // write in database then generate html report
        await writeToInflux(reports, options);
        await create_html_report(reportObj, options, translator, true);
    } else if (reportFormat === 'html') {
        await create_html_report(reportObj, options, translator, false);
    } else if (reportFormat === 'influxdb') {
        await writeToInflux(reports, options);
    } else {
        await create_XLSX_report(reportObj, options, translator);
    }
}

function readProxy(proxyFile:string): Proxy {
    const PROXY_FILE = path.resolve(proxyFile);
    try {
        const proxy = YAML.parse(fs.readFileSync(PROXY_FILE).toString());
        if (!proxy.server || !proxy.user || !proxy.password) {
            throw new Error(`proxy_config_file : Bad format "${PROXY_FILE}". Expected server, user and password.`);
        }
        return proxy;
    } catch (error) {
        if (error instanceof YAMLError) {
            throw new Error(`proxy_config_file : "${PROXY_FILE}" is not a valid YAML file: ${error.code} at ${JSON.stringify(
                error.linePos
            )}.`);
        } else {
            throw error
        }
    }
}

function readHeaders(headersFile: string): Headers {
    const HEADERS_YAML_FILE = path.resolve(headersFile);
    try {
        return YAML.parse(fs.readFileSync(HEADERS_YAML_FILE).toString());
    } catch (error) {
        if (error instanceof YAMLError) {
            throw new Error(` --headers : "${HEADERS_YAML_FILE}" is not a valid YAML file: ${error.code} at ${JSON.stringify(
                error.linePos
            )}.`);
        } else {
            throw error
        }
    }
}

function getReportFormat(format: Options['format'], filename: string): string | undefined {
    // Check if format is defined
    const formats = ['xlsx', 'html', 'influxdb', 'influxdbhtml'];
    if (format && formats.includes(format.toLowerCase())) {
        return format.toLowerCase();
    }

    // Else, check extension
    const filenameLC = filename.toLowerCase();
    const extensionFormat = formats.find((format) => filenameLC.endsWith(`.${format}`));
    if (extensionFormat) {
        console.log(`No output format specified, defaulting to ${extensionFormat} based on output file name.`);
    }
    return extensionFormat;
}

//export method that handle error
function analyse(options: Options) {
    analyse_core(options).catch((e) => console.error('ERROR : \n', e));
}

export {
    analyse,
    analyse_core
};

export type {
    Headers,
    LoginInformations,
    Options,
    PageInformations,
    PageInformationsAction,
    PageWait,
    Proxy
};

