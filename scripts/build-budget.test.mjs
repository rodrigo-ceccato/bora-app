import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(budget) {
  const root = mkdtempSync(join(tmpdir(), 'bora-budget-test-'));
  temporaryDirectories.push(root);
  const dist = join(root, 'dist/assets');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'app.js'), 'const greeting = "bora";\n'.repeat(20));
  writeFileSync(join(dist, 'app.css'), '.bora { color: #123; }\n'.repeat(10));
  const budgetFile = join(root, 'budget.json');
  writeFileSync(budgetFile, JSON.stringify(budget));
  return { root, dist: join(root, 'dist'), budgetFile };
}

function check({ root, dist, budgetFile }) {
  return spawnSync(process.execPath, [
    join(repository, 'scripts/check-build-budget.mjs'),
    `--dist=${dist}`,
    `--budget=${budgetFile}`
  ], { cwd: root, encoding: 'utf8' });
}

describe('production build budgets', () => {
  it('passes when both parsed and deterministic gzip totals fit', () => {
    const result = check(fixture({
      javascript: { parsedBytes: 1_000, gzipBytes: 1_000 },
      css: { parsedBytes: 1_000, gzipBytes: 1_000 }
    }));

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Production JS/CSS build budgets are within limits.');
  });

  it('fails with the exact category and metric that regressed', () => {
    const result = check(fixture({
      javascript: { parsedBytes: 100, gzipBytes: 1_000 },
      css: { parsedBytes: 1_000, gzipBytes: 1_000 }
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('javascript.parsedBytes exceeded');
  });
});
