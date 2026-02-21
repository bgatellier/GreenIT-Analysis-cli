declare module "chrome-har" {
    import har from 'har-format'

    type Log = {
        log: {
            version: string;
            creator: {
                name: string;
                version: string;
                comment: string;
            };
            pages: unknown[];
            entries: har.Entry[];
        };
    };

    type ChromeDevtoolsMessage = {
        method: string;
        params: Record<string, unknown>;
    };

    type HarFromMessagesOptions = {
        includeResourcesFromDiskCache?: boolean;
        includeTextFromResponseBody?: boolean;
    };

    function harFromMessages(messages: ChromeDevtoolsMessage[], options: HarFromMessagesOptions): Log;
}
