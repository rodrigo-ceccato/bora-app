import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const zones = ['UTC', 'America/Sao_Paulo', 'America/New_York'];
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const dateTests = [
  'src/lib/calendar.test.ts',
  'src/lib/activity.test.ts',
  'src/lib/datetime.test.ts',
  'src/lib/invite.test.ts',
  'src/lib/options.test.ts',
  'src/lib/results.test.ts',
  'src/lib/schedule.test.ts'
];

for (const timeZone of zones) {
  console.log(`Running date/time tests with TZ=${timeZone}`);
  const result = spawnSync(process.execPath, [vitest, 'run', ...dateTests], {
    env: { ...process.env, TZ: timeZone },
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(`Could not start Vitest for ${timeZone}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
