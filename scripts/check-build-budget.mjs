import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return resolve(repository, entry ? entry.slice(prefix.length) : fallback);
}

function filesBelow(directory) {
  const entries = [];
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) entries.push(...filesBelow(path));
    else entries.push(path);
  }
  return entries;
}

function measure(files, extension) {
  const selected = files.filter((file) => extname(file) === extension);
  return selected.reduce((total, file) => {
    const contents = readFileSync(file);
    total.parsedBytes += contents.byteLength;
    total.gzipBytes += gzipSync(contents, { level: 9 }).byteLength;
    return total;
  }, { files: selected.length, parsedBytes: 0, gzipBytes: 0 });
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

const dist = argument('dist', 'dist');
const budgetFile = argument('budget', 'scripts/build-budgets.json');
const budgets = JSON.parse(readFileSync(budgetFile, 'utf8'));
const files = filesBelow(dist);
const results = {
  javascript: measure(files, '.js'),
  css: measure(files, '.css')
};
const failures = [];

for (const [kind, result] of Object.entries(results)) {
  if (result.files === 0) failures.push(`${kind}: production build contains no matching assets`);
  for (const metric of ['parsedBytes', 'gzipBytes']) {
    const limit = positiveInteger(budgets[kind]?.[metric], `${kind}.${metric}`);
    const percent = ((result[metric] / limit) * 100).toFixed(1);
    process.stdout.write(`${kind} ${metric}: ${result[metric]} / ${limit} bytes (${percent}%)\n`);
    if (result[metric] > limit) failures.push(`${kind}.${metric} exceeded by ${result[metric] - limit} bytes`);
  }
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`Build budget failed: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Production JS/CSS build budgets are within limits.\n');
}
