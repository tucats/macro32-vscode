// Checks the formatter on test/*.mar and any files named on the command
// line: formatting changes nothing but blanks, and formatting twice
// gives what formatting once did. Run with `npm test [files...]`.
'use strict';

const fs = require('fs');
const path = require('path');
const { formatText } = require('../out/format');

const files = process.argv.slice(2);
if (files.length === 0) {
    for (const f of fs.readdirSync(__dirname)) {
        if (/\.mar$/i.test(f)) files.push(path.join(__dirname, f));
    }
}

const squeeze = (s) => s.split(/\r?\n/).map((l) => l.replace(/\s+/g, ''));
let failures = 0;

for (const f of files) {
    const text = fs.readFileSync(f, 'latin1');
    const once = formatText(text);
    const twice = formatText(once);
    const a = squeeze(text), b = squeeze(once);
    const bad = a.findIndex((l, i) => l !== b[i]);
    if (a.length !== b.length || bad >= 0) {
        console.log(`${f}:${bad + 1}: formatting changed more than blanks`);
        failures++;
    } else if (once !== twice) {
        const l1 = once.split('\n'), l2 = twice.split('\n');
        const n = l1.findIndex((l, i) => l !== l2[i]);
        console.log(`${f}:${n + 1}: formatting isn't stable:\n  ${JSON.stringify(l1[n])}\n  ${JSON.stringify(l2[n])}`);
        failures++;
    }
}
console.log(`${files.length} files, ${failures} failures`);
process.exit(failures ? 1 : 0);
