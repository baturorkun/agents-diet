import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { check, findInstructionFiles, referencedPaths, DEFAULT_MAX_BYTES, UsageError } from '../dist/index.js';
import { CLEAN, withProject } from './helpers.mjs';

const kinds = (report) => report.files.flatMap((file) => file.findings.map((finding) => `${file.path}: ${finding.kind}${finding.ref ? ` ${finding.ref}` : ''}`));

test('a clean project has no finding', () => {
  withProject(CLEAN, (root) => {
    const report = check(root);
    assert.deepEqual(kinds(report), []);
    assert.deepEqual(report.files.map((file) => file.path), ['AGENTS.md', 'CLAUDE.md']);
    assert.deepEqual(report.limit, { bytes: DEFAULT_MAX_BYTES, source: 'default' });
    assert.equal(report.summary.findings, 0);
  });
});

test('sizes: bytes in UTF-8, characters, and tokens as characters / 4', () => {
  withProject({ ...CLEAN, 'AGENTS.md': 'çalışma\n' }, (root) => {
    const agents = check(root).files.find((file) => file.path === 'AGENTS.md');
    assert.deepEqual({ bytes: agents.bytes, chars: agents.chars, tokens: agents.tokens }, { bytes: 11, chars: 8, tokens: 2 });
  });
});

test('each finding kind is reported once on the file it belongs to', () => {
  withProject(
    {
      'AGENTS.md': `# Rules\n\nSee [old notes](docs/old.md) and \`scripts/gone.sh\`.\n${'x'.repeat(200)}\n`,
      'pkg/AGENTS.md': '# Package rules\n',
      'pkg/CLAUDE.md': '# Claude Code\n\nRead the rules.\n',
    },
    (root) => {
      const report = check(root, { maxBytes: 100 });
      assert.deepEqual(kinds(report), [
        'AGENTS.md: over-limit',
        'AGENTS.md: missing-claude-md',
        'AGENTS.md: dead-reference docs/old.md',
        'AGENTS.md: dead-reference scripts/gone.sh',
        'pkg/AGENTS.md: no-agents-import',
      ]);
      assert.match(report.files[0].findings[1].message, /Claude Code does not read AGENTS\.md/);
    },
  );
});

test('the limit: the flag, then package.json, then .agents-diet.json, then 32768, and its source', () => {
  const big = { ...CLEAN, 'package.json': JSON.stringify({ name: 'x', 'agents-diet': { maxBytes: 50 } }), '.agents-diet.json': JSON.stringify({ maxBytes: 60 }) };
  withProject(big, (root) => {
    assert.deepEqual(check(root, { maxBytes: 40 }).limit, { bytes: 40, source: 'flag' });
    assert.deepEqual(check(root).limit, { bytes: 50, source: 'package.json' });
  });
  withProject({ ...CLEAN, '.agents-diet.json': JSON.stringify({ maxBytes: 60 }) }, (root) => {
    assert.deepEqual(check(root).limit, { bytes: 60, source: '.agents-diet.json' });
  });
  withProject({ ...CLEAN, 'package.json': JSON.stringify({ name: 'x' }) }, (root) => {
    assert.deepEqual(check(root).limit, { bytes: 32768, source: 'default' });
  });
  withProject({ ...CLEAN, '.agents-diet.json': JSON.stringify({ maxBytes: -1 }) }, (root) => {
    assert.throws(() => check(root), UsageError);
  });
});

test('.claude/CLAUDE.md with the import satisfies the root; @./AGENTS.md is an import too', () => {
  const { 'CLAUDE.md': _drop, ...withoutRoot } = CLEAN;
  withProject({ ...withoutRoot, '.claude/CLAUDE.md': '@AGENTS.md\n' }, (root) => {
    assert.deepEqual(kinds(check(root)), []);
  });
  withProject({ ...CLEAN, 'CLAUDE.md': '@./AGENTS.md\n' }, (root) => {
    assert.deepEqual(kinds(check(root)), []);
  });
});

test('references that exist or are not paths are not reported', () => {
  const text = [
    'Relative to the file: [sibling](notes.md). Relative to the project: `src/index.ts`.',
    'Not paths: https://example.com/a.md, [link](https://example.com/b.md), [anchor](#rules), [mail](mailto:a@b.c).',
    'Skipped: `/etc/hosts`, `~/x/y.md`, `runs/*/report.json`, `<dir>/file.md`, `$HOME/a.md`, `node_modules/pkg/x.js`.',
    'Suffixes dropped: `src/index.ts:12`, [guide](docs/guide.md#install).',
    'Commands are not paths: `pnpm build`, `git rev-parse --show-toplevel`.',
  ].join('\n');
  withProject({ ...CLEAN, 'pkg/AGENTS.md': text, 'pkg/CLAUDE.md': '@AGENTS.md\n', 'pkg/notes.md': '#\n' }, (root) => {
    assert.deepEqual(kinds(check(root)), []);
  });
});

test('@imports in CLAUDE.md are checked like other references', () => {
  withProject({ ...CLEAN, 'CLAUDE.md': '@AGENTS.md\n@docs/missing.md\n' }, (root) => {
    assert.deepEqual(kinds(check(root)), ['CLAUDE.md: dead-reference docs/missing.md']);
  });
});

test('files under node_modules, .git, dist, build, coverage and .pnpm-store are not looked at', () => {
  const hidden = Object.fromEntries(['node_modules/x', '.git/x', 'dist', 'build', 'coverage', '.pnpm-store/v1'].map((dir) => [`${dir}/AGENTS.md`, '# no\n']));
  withProject({ ...CLEAN, ...hidden }, (root) => {
    assert.deepEqual(findInstructionFiles(root), ['AGENTS.md', 'CLAUDE.md']);
  });
});

test('referencedPaths keeps one entry per path', () => {
  assert.deepEqual(referencedPaths('`a/b.md` and [x](a/b.md) and `a/b.md`'), ['a/b.md']);
});

test('check only reads', () => {
  withProject({ ...CLEAN, 'AGENTS.md': 'See `gone/file.md`.\n' }, (root) => {
    const before = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    check(root);
    assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), before);
  });
});

test('code, versions, hosts and bare extensions are not paths', () => {
  assert.deepEqual(referencedPaths('`config_identity.same` `pkg.MASKED` `hier-config>=3.7.1` `root@host:/srv/app` `.bit` `f(x).js` `notes.md` `src/a.ts`'), ['notes.md', 'src/a.ts']);
});

test('a file named without a directory may live anywhere in the project', () => {
  withProject({ ...CLEAN, 'AGENTS.md': 'Edit `theme.ts`, not `gone.ts`.\n', 'web/src/theme.ts': '\n' }, (root) => {
    assert.deepEqual(kinds(check(root)), ['AGENTS.md: dead-reference gone.ts']);
  });
});

test('in a Git checkout, ignored files are not checked and ignored paths are not dead', () => {
  withProject({ ...CLEAN, '.gitignore': 'out/\ncopies/\n', 'AGENTS.md': 'The build writes `out/report.md`.\n', 'copies/AGENTS.md': 'stale `gone/x.md`\n' }, (root) => {
    spawnSync('git', ['init', '-q'], { cwd: root });
    const report = check(root);
    assert.deepEqual(report.files.map((file) => file.path), ['AGENTS.md', 'CLAUDE.md']);
    assert.deepEqual(kinds(report), []);
  });
});

test('ignore: paths the project leaves out, from package.json or .agents-diet.json', () => {
  const files = { ...CLEAN, 'runs/1/AGENTS.md': 'old `gone/x.md`\n', 'AGENTS.md': 'Runs land in `runs/2/manifest.json`.\n' };
  withProject({ ...files, '.agents-diet.json': JSON.stringify({ ignore: ['runs/'] }) }, (root) => {
    const report = check(root);
    assert.deepEqual(report.ignore, ['runs']);
    assert.deepEqual(report.files.map((file) => file.path), ['AGENTS.md', 'CLAUDE.md']);
    assert.deepEqual(kinds(report), []);
  });
  withProject({ ...files, 'package.json': JSON.stringify({ name: 'x', 'agents-diet': { ignore: ['runs'] } }) }, (root) => {
    assert.deepEqual(kinds(check(root)), []);
  });
  withProject({ ...files, '.agents-diet.json': JSON.stringify({ ignore: 'runs' }) }, (root) => {
    assert.throws(() => check(root), UsageError);
  });
});

test('a directory that does not exist is a usage error', () => {
  assert.throws(() => check('/no/such/agents-diet/dir'), UsageError);
});
