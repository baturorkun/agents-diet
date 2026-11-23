import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { compareRewrite, mergeRewrite, rewriteApply, rewriteDiscard, splitSections, CANDIDATE_DIR, UsageError } from '../dist/index.js';
import { withProject } from './helpers.mjs';

const cli = (...args) => spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });
const filler = 'It is important to note that the following guidance applies to everyone who works on this project every single day. ';
const rule = 'You must run `pnpm test` before you push, unless the change only touches README.md.';
const body = `${filler}${rule} The suite covers the parser and the renderer and it also covers the command line entry point of the package, which is what users run in practice when they install it from the registry.\n`;
const short = `${rule} The suite covers the parser and the renderer and it also covers the command line entry point of the package, which is what users run in practice when they install it from the registry.\n`;
const file = `# Project\n\n${body}\n## Other\n\nLeave this section alone, it is fine as it is.\n`;
const good = file.replace(body, short);
const section = (before, after, i = 1) => compareRewrite(before, after).sections[i];

test('removing filler is accepted; the other section is unchanged', () => {
  const r = compareRewrite(file, good);
  assert.equal(r.structureOk, true);
  assert.equal(r.sections[0].status, 'accepted');
  assert.equal(r.sections[1].status, 'unchanged');
  assert.ok(r.acceptedBytes >= 100);
});

const lost = {
  'a command': ['`pnpm test`', '`npm test`'],
  'a file name': ['README.md', 'docs'],
  'the force of a rule': ['You must run', 'You can run'],
  'an exception': [', unless the change only touches README.md', ' for README.md'],
  'an order word': ['before you push', 'as you push'],
};
for (const [name, [from, to]] of Object.entries(lost)) {
  test(`changing ${name} is rejected`, () => {
    const r = compareRewrite(file, good.replace(from, to)).sections[0];
    assert.equal(r.status, 'rejected');
    assert.ok(r.missing.length > 0, JSON.stringify(r));
  });
}

test('numbers, paths, env vars, URLs and identifiers are protected', () => {
  for (const value of ['version 18.2.1', 'src/core/index.ts', 'API_BASE_URL', 'https://example.com/guide', 'load_config', 'parseArgs', 'timeout 30 ms']) {
    const before = `# T\n\n${filler}${filler}Use ${value} here as the project documents it.\n`;
    const r = compareRewrite(before, `# T\n\n${filler}Use it here as the project documents it.\n`).sections[0];
    assert.equal(r.status, 'rejected', value);
  }
});

test('code blocks, numbered steps, imports and security lines must stay exact', () => {
  const blocks = ['```sh\nmake build\n```', '1. Run the build first.', '@AGENTS.md', 'Keep the API token out of logs.'];
  for (const line of blocks) {
    const before = `# T\n\n${filler}${filler}\n${line}\n`;
    const changed = line.replace('build', 'compile').replace('@AGENTS', '@CLAUDE').replace('Keep', 'Hold');
    assert.equal(compareRewrite(before, `# T\n\n${filler}\n${changed}\n`).sections[0].status, 'rejected', line);
  }
});

test('frontmatter and protected order may not change', () => {
  const front = `---\nname: a\n---\n${filler}${filler}\n`;
  assert.equal(compareRewrite(front, `---\nname: b\n---\n${filler}\n`).sections[0].status, 'rejected');
  const order = `# T\n\n${filler}${filler}Run \`a-step\` and later \`b-step\`.\n`;
  const r = compareRewrite(order, `# T\n\n${filler}Run \`b-step\` and later \`a-step\`.\n`).sections[0];
  assert.equal(r.status, 'rejected');
  assert.match(r.reasons.join(), /order/);
});

test('removing an exact repeat of a sentence is allowed', () => {
  const repeat = 'Never commit generated files to the repository under any circumstances at all, even when a reviewer asks for them in a pull request.';
  const padding = [1, 2, 3, 4].map((n) => `Paragraph ${n} explains the background of the project at some length for new people joining us. `).join('');
  const before = `# T\n\n${repeat} ${padding}${repeat}\n`;
  assert.equal(compareRewrite(before, `# T\n\n${repeat} ${padding}\n`).sections[0].status, 'accepted');
});

test('the bounds: over 30% or under 100 bytes is rejected, and growth', () => {
  const long = `# T\n\n${'Background words without any instruction in them at all. '.repeat(10)}\n`;
  const half = `# T\n\n${'Background words without any instruction in them at all. '.repeat(5)}\n`;
  assert.match(compareRewrite(long, half).sections[0].reasons.join(), /over the limit of 30%/);
  const tiny = long.replace('Background words without', 'Background words');
  assert.match(compareRewrite(long, tiny).sections[0].reasons.join(), /under the minimum of 100/);
  assert.match(compareRewrite(long, long.replace('Background', 'Background and more')).sections[0].reasons.join(), /grew/);
});

test('a changed heading rejects every section', () => {
  const r = compareRewrite(file, good.replace('## Other', '## Else'));
  assert.equal(r.structureOk, false);
  assert.ok(r.sections.every((s) => s.status === 'rejected'));
});

test('sections join back to the exact text; a # inside a code fence is no heading', () => {
  const text = `intro\n# A\n\`\`\`sh\n# comment\n\`\`\`\n## B\nend`;
  const parts = splitSections(text);
  assert.equal(parts.map((p) => p.text).join(''), text);
  assert.deepEqual(parts.map((p) => p.heading), [null, '# A', '## B']);
});

test('merge takes only selected accepted sections and refuses a rejected one', () => {
  assert.equal(mergeRewrite(file, good, [1]), good);
  assert.equal(mergeRewrite(file, good, []), file);
  assert.throws(() => mergeRewrite(file, good.replace('You must', 'You can'), [1]), UsageError);
  assert.throws(() => mergeRewrite(file, good, [9]), UsageError);
});

const candidate = (root, text) => {
  const path = join(root, CANDIDATE_DIR, 'CLAUDE.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};

test('apply writes the selection, removes the candidate and, without Git, keeps the original', () => {
  withProject({ 'CLAUDE.md': file }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const done = rewriteApply(target, candidate(root, good), [1]);
    assert.equal(readFileSync(target, 'utf8'), good);
    assert.equal(readFileSync(done.backup, 'utf8'), file);
    assert.ok(!existsSync(join(root, CANDIDATE_DIR)));
  });
});

test('a rejected apply changes nothing; discard removes only a candidate', () => {
  withProject({ 'CLAUDE.md': file }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const path = candidate(root, good.replace('You must', 'You can'));
    assert.throws(() => rewriteApply(target, path, [1]), UsageError);
    assert.equal(readFileSync(target, 'utf8'), file);
    assert.ok(existsSync(path));
    assert.throws(() => rewriteDiscard(target), UsageError);
    assert.ok(existsSync(target));
    rewriteDiscard(path);
    assert.ok(!existsSync(join(root, CANDIDATE_DIR)));
  });
});

test('the CLI: check exits 0 or 1, apply needs sections, usage errors exit 2', () => {
  withProject({ 'CLAUDE.md': file }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const path = candidate(root, good);
    const ok = cli('rewrite', 'check', target, path);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /1 section\(s\) accepted/);
    assert.equal(JSON.parse(cli('rewrite', 'check', target, path, '--json').stdout).structureOk, true);
    assert.equal(cli('rewrite', 'apply', target, path).status, 2);
    writeFileSync(path, good.replace('You must', 'You can'));
    assert.equal(cli('rewrite', 'check', target, path).status, 1);
    writeFileSync(path, good);
    const applied = cli('rewrite', 'apply', target, path, '--sections', '1');
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(readFileSync(target, 'utf8'), good);
  });
  assert.equal(cli('rewrite').status, 2);
  assert.equal(cli('check', '.', '--sections', '1').status, 2);
});
