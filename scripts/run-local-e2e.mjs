import { spawnSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
// The full suite deliberately exercises many independent event creations from
// one browser host. Raise only this disposable stack's limits; production keeps 1.
const e2eEnvironment = { ...process.env, BORA_RATE_LIMIT_SCALE: '100' };

function run(command, args) {
  const result = spawnSync(command, args, { env: e2eEnvironment, stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('Building and starting the local Bora Compose stack...');
const dockerCheck = spawnSync('docker', ['info'], { env: process.env, stdio: 'ignore' });
if (dockerCheck.error || dockerCheck.status !== 0) {
  console.error('The Docker daemon is not available. Start Docker and run npm run test:e2e:local again.');
  process.exit(1);
}
run('docker', ['compose', 'up', '-d', '--build']);

const healthUrl = `${baseUrl}/api/health`;
console.log(`Waiting for ${healthUrl}...`);
let healthy = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await globalThis.fetch(healthUrl);
    if (response.ok) {
      healthy = true;
      break;
    }
  } catch {
    // The web container may still be starting.
  }
  await wait(1_000);
}

if (!healthy) {
  console.error(`The local Bora stack did not become healthy at ${healthUrl}.`);
  spawnSync('docker', ['compose', 'ps'], { env: process.env, stdio: 'inherit' });
  spawnSync('docker', ['compose', 'logs', '--tail', '80', 'api', 'web'], { env: process.env, stdio: 'inherit' });
  process.exit(1);
}

console.log('Running the full Playwright browser/device matrix in the controlled Compose test container...');
const tests = spawnSync('docker', ['compose', 'run', '--rm', '--build', '-e', 'PLAYWRIGHT_BASE_URL=http://web', 'e2e'], { env: e2eEnvironment, stdio: 'inherit' });
if (tests.error || tests.status !== 0) {
  console.error('Local E2E checks failed. Recent application logs follow.');
  spawnSync('docker', ['compose', 'logs', '--tail', '80', 'api', 'web'], { env: process.env, stdio: 'inherit' });
  process.exit(tests.status || 1);
}
console.log('Local E2E checks passed. The Compose stack remains running.');
