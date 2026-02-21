import util from 'node:util';
import fr from '../locales/fr.json';

type Locale = 'en' | 'fr'

class Translator {
    private catalog: Record<string, string>

    constructor() {
        this.catalog = fr;
    }

    getCatalog() {
        return this.catalog;
    }

    async setLocale(locale: Locale) {
        const filePath = `../locales/{locale}.json`
        this.catalog = (await import(filePath)).default;
    }

    translateRule(rule: string): string | undefined {
        return this.translate('rule_' + rule);
    }

    translate(key: string): string | undefined {
        return this.catalog[key];
    }

    translateWithArgs(key: string, ...args: unknown[]) {
        return util.format(this.catalog[key], args);
    }
}

export const translator = new Translator()
export type { Locale, Translator }
