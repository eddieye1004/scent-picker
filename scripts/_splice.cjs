const fs = require('fs');
const p = process.argv[2];
const start = Number(process.argv[3]);
const end = Number(process.argv[4]);
const repl = fs.readFileSync(process.argv[5], 'utf8').replace(/\r?\n$/, '');
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const out = [...lines.slice(0, start - 1), ...repl.split(/\r?\n/), ...lines.slice(end)];
fs.writeFileSync(p, out.join('\n'));
console.log(`spliced ${end - start + 1} -> ${repl.split(/\r?\n/).length}`);
