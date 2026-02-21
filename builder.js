const concat = require('concat-files');
const glob = require('glob');
const fs = require('fs');

const DIR = './dist';

if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR);
}

const rules = glob.sync('./dist/greenit-core/rules/*.js');

//One script to analyse them all
concat(
    [
        './dist/greenit-core/analyseFrameCore.js',
        './dist/greenit-core/utils.js',
        './dist/greenit-core/rulesManager.js',
        './dist/greenit-core/ecoIndex.js',
        ...rules,
        './dist/greenit-core/greenpanel.js',
    ],
    './dist/greenItBundle.js',
    function (err) {
        if (err) throw err;
        console.log('build complete');
    }
);
