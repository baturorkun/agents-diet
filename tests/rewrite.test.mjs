import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { compareRewrite, mergeRewrite, previewRewrite, rewriteApply, rewriteDiscard, splitSections, candidateFor, UsageError } from '../dist/index.js';
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

test('code blocks, imports and security lines must stay exact', () => {
  const blocks = ['```sh\nmake build\n```', '@AGENTS.md', 'Keep the API token out of logs.'];
  for (const line of blocks) {
    const before = `# T\n\n${filler}${filler}\n${line}\n`;
    const changed = line.replace('build', 'compile').replace('@AGENTS', '@CLAUDE').replace('Keep', 'Hold');
    assert.equal(compareRewrite(before, `# T\n\n${filler}\n${changed}\n`).sections[0].status, 'rejected', line);
  }
});

test('frontmatter may not change', () => {
  const front = `---\nname: a\n---\n${filler}${filler}\n`;
  assert.equal(compareRewrite(front, `---\nname: b\n---\n${filler}\n`).sections[0].status, 'rejected');
});

test('the acceptance examples: common words may go, a prohibition may not', () => {
  const ok = compareRewrite('# T\n\nWhen you are working on a feature, you must always run `pnpm test` before pushing.\n', '# T\n\nYou must run `pnpm test` before pushing.\n');
  assert.equal(ok.sections[0].status, 'accepted', JSON.stringify(ok.sections[0]));
  const no = compareRewrite('# T\n\nNever commit generated files.\n', '# T\n\nAvoid committing generated files.\n').sections[0];
  assert.equal(no.status, 'rejected');
  assert.ok(no.missing.includes('word: never'));
  assert.equal(compareRewrite('# T\n\nPlease do not edit the generated files by hand.\n', "# T\n\nDon't edit generated files by hand.\n").sections[0].status, 'accepted');
});

test('each protected word is kept', () => {
  for (const word of ['never', 'do not', 'cannot', 'must not', 'forbidden', 'prohibited', 'asla', 'yasak', 'must', 'required', 'mutlaka', 'zorunlu', 'unless', 'except', 'only if', 'only when', 'hariç']) {
    const before = `# T\n\nBackground sentence first. Agents ${word} touch this area.\n`;
    assert.equal(compareRewrite(before, '# T\n\nAgents touch this area.\n').sections[0].status, 'rejected', word);
  }
});

test('a procedure step can be shortened; its number, order and protected items cannot change', () => {
  const before = '# T\n\n1. First of all, go ahead and run `pnpm build` in the project.\n2. After that has finished, run `pnpm publish` from the root.\n';
  assert.equal(compareRewrite(before, '# T\n\n1. Run `pnpm build`.\n2. Run `pnpm publish`.\n').sections[0].status, 'accepted');
  assert.match(compareRewrite(before, '# T\n\n1. Run `pnpm build`, then `pnpm publish`.\n').sections[0].reasons.join(), /number or order/);
  assert.match(compareRewrite(before, '# T\n\n1. Run `pnpm publish`.\n2. Run `pnpm build`.\n').sections[0].reasons.join(), /protected item or it moved/);
});

test('removing an exact repeat of a sentence is allowed', () => {
  const repeat = 'Never commit generated files to the repository under any circumstances at all, even when a reviewer asks for them in a pull request.';
  const padding = [1, 2, 3, 4].map((n) => `Paragraph ${n} explains the background of the project at some length for new people joining us. `).join('');
  const before = `# T\n\n${repeat} ${padding}${repeat}\n`;
  assert.equal(compareRewrite(before, `# T\n\n${repeat} ${padding}\n`).sections[0].status, 'accepted');
});

test('there is no size limit: a large or a small saving can be applied; growth cannot', () => {
  const long = `# T\n\n${['one', 'two', 'three', 'four', 'five', 'six'].map((n) => `Background sentence ${n} carries no instruction at all.`).join(' ')}\n`;
  const half = '# T\n\nBackground.\n';
  assert.equal(compareRewrite(long, half).sections[0].status, 'accepted');
  const tiny = long.replace('Background sentence', 'Background');
  assert.equal(mergeRewrite(long, tiny), tiny);
  assert.match(compareRewrite(long, long.replace('Background', 'Background and more')).sections[0].reasons.join(), /grew/);
  assert.match(compareRewrite(long, long.replace('Background', 'backgrounD')).sections[0].reasons.join(), /did not get shorter/);
});

test('small savings in several sections count together', () => {
  const part = (name) => `## ${name}\n\nIt is worth saying here that the ${name} area holds background notes for people who read it.\n`;
  const before = ['One', 'Two', 'Three', 'Four'].map(part).join('\n');
  const after = before.replaceAll('It is worth saying here that the', 'The');
  const report = compareRewrite(before, after);
  assert.ok(report.sections.every((x) => x.status === 'accepted' && x.savedBytes < 100));
  assert.equal(mergeRewrite(before, after), after);
});

test('auth or token alone does not lock a line; a secret value and a security rule do', () => {
  const pad = 'Background notes on how this part of the project came together over the last few years of work. ';
  const plain = `# T\n\nThe auth module and the token parser live in one package, and ${pad}${pad}${pad}${pad}\n`;
  assert.equal(compareRewrite(plain, plain.replace(pad, '')).sections[0].status, 'accepted');
  for (const line of [`The sandbox uses API_KEY=abc123456789. ${pad}${pad}${pad}${pad}`, `Never log an auth token anywhere. ${pad}${pad}${pad}${pad}`]) {
    const before = `# T\n\n${line}\n`;
    assert.equal(compareRewrite(before, before.replace(pad, '')).sections[0].status, 'rejected', line);
  }
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

const two = `# One\n\n${body}\n## Two\n\n${body.replace('pnpm test', 'pnpm lint')}`;
const twoShort = two.replaceAll(filler, '');

test('merge takes all accepted sections and leaves out headings by name', () => {
  assert.equal(mergeRewrite(two, twoShort), twoShort);
  const kept = mergeRewrite(two, twoShort, ['two']);
  assert.ok(kept.includes(`# One\n\n${short}`));
  assert.ok(kept.includes(filler), 'the excluded section is unchanged');
  assert.equal(mergeRewrite(two, twoShort, ['## One']).startsWith(`# One\n\n${body}`), true);
  assert.throws(() => mergeRewrite(two, twoShort, ['Nope']), /no section is named/);
  assert.throws(() => mergeRewrite(file, good, ['Project']), /no accepted section/);
});

test('the preview uses real headings, explains what stays and shows changed lines, without numbers', () => {
  const before = `# Guide\n\n${body}\n## Release\n\n1. Run the build first.\n2. Publish it.\n`;
  const p = previewRewrite(before, before.replace(filler, ''));
  assert.equal(p.canApply, true);
  assert.deepEqual(p.shortened.map((x) => x.heading), ['Guide']);
  assert.deepEqual(p.kept, [{ heading: 'Release', why: 'no change proposed', missing: [] }]);
  assert.ok(p.shortened[0].changes.some((c) => c.type === 'removed') && p.shortened[0].changes.some((c) => c.type === 'added'));
  assert.ok(!JSON.stringify(p).includes('"index"'));
});

test('no safe shortening: nothing can be applied and the preview says why', () => {
  const p = previewRewrite(file, good.replace('You must', 'You can'));
  assert.equal(p.canApply, false);
  assert.equal(p.afterBytes, p.beforeBytes);
  assert.equal(p.shortened.length, 0);
  assert.ok(p.kept[0].missing.some((m) => /must/.test(m)));
});

test('a secret value is masked in the preview and in check', () => {
  const secret = 'abcDEF1234567890secret';
  const before = `# T\n\nUse API_KEY=${secret} for the account. ${filler}${filler}\n`;
  const after = before.replace(filler, '');
  const p = previewRewrite(before, after);
  assert.ok(!JSON.stringify(p).includes(secret));
  assert.ok(!JSON.stringify(compareRewrite(before, after)).includes(secret));
});

const candidate = (root, text) => {
  const path = candidateFor(join(root, 'CLAUDE.md'));
  writeFileSync(path, text);
  return path;
};

test('apply writes the selection, removes the candidate and, without Git, keeps the original', () => {
  withProject({ 'CLAUDE.md': file }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const done = rewriteApply(target, candidate(root, good));
    assert.equal(readFileSync(target, 'utf8'), good);
    assert.equal(readFileSync(done.backup, 'utf8'), file);
    assert.ok(!existsSync(join(root, 'CLAUDE.rewrite.md')));
  });
});

test('a rejected apply changes nothing; discard removes only a candidate', () => {
  withProject({ 'CLAUDE.md': file }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const path = candidate(root, good.replace('You must', 'You can'));
    assert.throws(() => rewriteApply(target, path), UsageError);
    assert.equal(readFileSync(target, 'utf8'), file);
    assert.ok(existsSync(path));
    assert.throws(() => rewriteDiscard(target), UsageError);
    assert.ok(existsSync(target));
    rewriteDiscard(path);
    assert.ok(!existsSync(join(root, 'CLAUDE.rewrite.md')));
  });
});

test('only the matching visible file is accepted; discard removes nothing else', () => {
  assert.equal(candidateFor('a/CLAUDE.md'), join('a', 'CLAUDE.rewrite.md'));
  withProject({ 'CLAUDE.md': file, 'AGENTS.md': file, 'notes.md': 'mine\n', 'orphan.rewrite.md': 'x\n', '.agents-diet-rewrite/CLAUDE.md': good }, (root) => {
    const target = join(root, 'CLAUDE.md');
    writeFileSync(join(root, 'AGENTS.rewrite.md'), good);
    assert.equal(cli('rewrite', 'preview', target, join(root, 'AGENTS.rewrite.md')).status, 2);
    assert.equal(cli('rewrite', 'preview', target, join(root, '.agents-diet-rewrite/CLAUDE.md')).status, 2);
    assert.throws(() => rewriteDiscard(join(root, 'notes.md')), UsageError);
    assert.throws(() => rewriteDiscard(join(root, 'orphan.rewrite.md')), UsageError);
    assert.ok(existsSync(join(root, 'notes.md')) && existsSync(join(root, 'orphan.rewrite.md')));
    rewriteDiscard(join(root, 'AGENTS.rewrite.md'));
    assert.ok(!existsSync(join(root, 'AGENTS.rewrite.md')) && existsSync(join(root, 'AGENTS.md')));
    rewriteDiscard(join(root, '.agents-diet-rewrite/CLAUDE.md'));
    assert.ok(!existsSync(join(root, '.agents-diet-rewrite')), 'a leftover from the old folder can be cleaned');
  });
});

test('the preview names both real files and how to compare them', () => {
  withProject({ 'CLAUDE.md': two }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const path = candidate(root, twoShort);
    const shown = cli('rewrite', 'preview', target, path).stdout;
    assert.ok(shown.includes(`Original: ${target}`) && shown.includes(`New file: ${path}`));
    assert.ok(shown.includes(`git diff --no-index -- ${target} ${path}`));
    assert.equal(readFileSync(target, 'utf8'), two, 'the original is untouched');
    assert.equal(readFileSync(path, 'utf8'), twoShort, 'the new file is untouched');
  });
});

test('the CLI: preview and check exit 0 or 1, apply excludes by heading, usage errors exit 2', () => {
  withProject({ 'CLAUDE.md': two }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const path = candidate(root, twoShort);
    const shown = cli('rewrite', 'preview', target, path);
    assert.equal(shown.status, 0, shown.stderr);
    assert.match(shown.stdout, /To shorten\n {2}One {2}/);
    assert.match(shown.stdout, /Changed lines/);
    assert.doesNotMatch(shown.stdout, /^\s*\d+\. /m);
    assert.equal(cli('rewrite', 'check', target, path).status, 0);
    assert.equal(JSON.parse(cli('rewrite', 'check', target, path, '--json').stdout).structureOk, true);
    assert.equal(cli('rewrite', 'apply', target, path, '--exclude', 'Nope').status, 2);
    writeFileSync(path, twoShort.replace('You must', 'You can'));
    assert.equal(cli('rewrite', 'check', target, path).status, 1);
    writeFileSync(path, twoShort);
    const applied = cli('rewrite', 'apply', target, path, '--exclude', 'Two');
    assert.equal(applied.status, 0, applied.stderr);
    const text = readFileSync(target, 'utf8');
    assert.ok(text.includes(`# One\n\n${short}`) && text.includes(filler));
  });
  withProject({ 'CLAUDE.md': file }, (root) => {
    const target = join(root, 'CLAUDE.md');
    const path = candidate(root, file);
    const none = cli('rewrite', 'preview', target, path);
    assert.equal(none.status, 1);
    assert.match(none.stdout, /is identical to .*no rewrite was written/);
  });
  assert.equal(cli('rewrite').status, 2);
  assert.equal(cli('check', '.', '--exclude', 'x').status, 2);
  assert.equal(cli('rewrite', 'apply', 'a', 'b', '--sections', '1').status, 2);
});
