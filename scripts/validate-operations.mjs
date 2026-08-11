import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caddyImage = 'caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648';
const nginxImage = 'nginx:1.30.4-alpine3.24@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46';

function execute(command, args, options = {}) {
  process.stdout.write(`==> ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
    }
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result.stdout;
}

const shellScripts = readdirSync(join(repository, 'deploy'))
  .filter((name) => name.endsWith('.sh'))
  .map((name) => `deploy/${name}`);
shellScripts.push('.githooks/pre-push');
execute('sh', ['-n', ...shellScripts]);

function composeConfig(files, env = {}) {
  const args = ['compose'];
  for (const file of files) args.push('-f', file);
  args.push('config', '--format', 'json');
  return JSON.parse(execute('docker', args, { capture: true, env }));
}

const local = composeConfig(['compose.yaml']);
if (local.services.api.environment.BORA_TRUST_PROXY_HOPS !== '1') {
  throw new Error('local nginx -> API Compose must trust exactly one proxy hop');
}

const production = composeConfig(['compose.yaml', 'compose.prod.yaml'], {
  BORA_BIND: '127.0.0.1',
  BORA_DOMAIN: 'bora.example',
  BORA_TLS_EMAIL: 'ops@example.com',
  BORA_TRUST_PROXY_HOPS: '2'
});
if (production.services.api.environment.BORA_TRUST_PROXY_HOPS !== '2') {
  throw new Error('production Caddy -> nginx -> API Compose must trust exactly two proxy hops');
}
if (!production.services.caddy) throw new Error('production Compose is missing Caddy');
const webPorts = production.services.web.ports || [];
if (!webPorts.length || webPorts.some((mapping) => mapping.host_ip !== '127.0.0.1')) {
  throw new Error('production web port must be bound only to 127.0.0.1');
}

execute('docker', [
  'run', '--rm',
  '-e', 'BORA_DOMAIN=bora.example',
  '-e', 'BORA_TLS_EMAIL=ops@example.com',
  '-v', `${join(repository, 'deploy/Caddyfile')}:/etc/caddy/Caddyfile:ro`,
  caddyImage, 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'
]);

execute('docker', [
  'run', '--rm',
  '--add-host', 'api:127.0.0.1',
  '-v', `${join(repository, 'deploy/nginx.conf')}:/etc/nginx/conf.d/default.conf:ro`,
  nginxImage, 'nginx', '-t'
]);

process.stdout.write('operations configuration is valid\n');
