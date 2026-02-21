import fs from 'node:fs';
import path from 'node:path';
import Sitemapper from 'sitemapper';
import YAML from 'yaml';

type Options = {
    sitemap_url: string,
    yaml_output_file: string,
}

const sitemap = new Sitemapper({
    timeout: 10000, // 10 second timeout
});

export default function parse(options: Options) {
    //handle inputs
    const SITEMAP_URL = options.sitemap_url;
    const OUTPUT_FILE = path.resolve(options.yaml_output_file);
    //parse sitemap
    sitemap
        .fetch(SITEMAP_URL)
        .then(function (res) {
            try {
                const urls = res.sites.map((site) => {
                    return { url: site };
                });
                fs.writeFileSync(OUTPUT_FILE, YAML.stringify(urls));
            } catch (error) {
                throw ` yaml_output_file : Path "${OUTPUT_FILE}" cannot be reached.`;
            }
        })
        .catch((e) => console.log('ERROR : \n' + e));
}
