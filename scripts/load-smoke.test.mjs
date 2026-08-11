import { describe, expect, it } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repository, 'scripts/load-smoke.mjs');

function run(env) {
  const cleanEnvironment = { ...process.env };
  delete cleanEnvironment.BORA_LOAD_BASE_URL;
  delete cleanEnvironment.BORA_LOAD_ALLOW_REMOTE;
  return spawnSync(process.execPath, [script], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...cleanEnvironment, ...env }
  });
}

describe('load-smoke safety boundary', () => {
  it('requires an explicit target instead of assuming production or localhost', () => {
    const result = run({});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Set BORA_LOAD_BASE_URL explicitly');
  });

  it('refuses a remote target without the destructive-data acknowledgement', () => {
    const result = run({ BORA_LOAD_BASE_URL: 'https://bora.example' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Remote load smoke is disabled');
  });
});
