import { execFileSync } from 'node:child_process';

const tag = process.argv[2];

if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('Usage: node scripts/create-release-tag.mjs vX.Y.Z');
  process.exit(1);
}

try {
  // Git's default cleanup discards Markdown headings because they begin with
  // '#'. Verbatim mode preserves the release notes exactly as written.
  execFileSync('git', ['tag', '-a', '--cleanup=verbatim', tag], { stdio: 'inherit' });
  execFileSync('node', ['scripts/validate-release-tag.mjs', tag], { stdio: 'inherit' });
} catch {
  console.error(`Release tag ${tag} was not ready to push.`);
  process.exit(1);
}
