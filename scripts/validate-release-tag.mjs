import { execFileSync } from 'node:child_process';

const tag = process.argv[2];

if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('Usage: node scripts/validate-release-tag.mjs vX.Y.Z');
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

try {
  if (git('cat-file', '-t', `refs/tags/${tag}`) !== 'tag') {
    throw new Error(`${tag} must be an annotated tag.`);
  }

  const tagObject = git('cat-file', '-p', `refs/tags/${tag}`);
  const notesSeparator = tagObject.indexOf('\n\n');
  const notes = notesSeparator === -1 ? '' : tagObject.slice(notesSeparator + 2);
  const section = /^## What users will notice\s*$/m.exec(notes);
  const remainingNotes = section ? notes.slice(section.index + section[0].length) : '';
  const nextHeading = remainingNotes.search(/^## /m);
  const userVisibleSection = nextHeading === -1 ? remainingNotes : remainingNotes.slice(0, nextHeading);
  const hasUserVisibleChange = /^[-*] +\S/m.test(userVisibleSection);

  if (!hasUserVisibleChange) {
    throw new Error(
      `${tag}'s annotation must include "## What users will notice" followed by at least one bullet.`,
    );
  }
} catch (error) {
  console.error(`Release preflight failed: ${error.message}`);
  process.exit(1);
}

console.log(`Release preflight passed for ${tag}.`);
