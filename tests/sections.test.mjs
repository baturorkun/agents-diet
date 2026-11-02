import assert from 'node:assert/strict';
import test from 'node:test';
import { check, sections } from '../dist/index.js';
import { CLEAN, withProject } from './helpers.mjs';

const FIXTURE = [
  'Read this first.',
  '',
  '# Project',
  '',
  'One paragraph on the architecture. See `src/index.ts`.',
  '',
  '## Deploy',
  '',
  '1. Build with `pnpm build`.',
  '2. Copy `dist/` to the host.',
  '- [ ] check the health endpoint',
  '',
  '```sh',
  '# not a heading: inside a fence',
  'pnpm deploy',
  '```',
  '',
  '### Rollback',
  '',
  'Run `scripts/rollback.sh`.',
  '',
  '## Design',
  '',
  'The `config_tree.py` module owns the tree; see [notes](docs/design.md).',
  '',
  '#### Too deep to be a section',
  '',
  'Text that belongs to Design.',
  '',
].join('\n');

const bytes = (text) => Buffer.byteLength(text, 'utf8');

test('sections: the preamble, headings 1–3, nesting, steps, code blocks and paths', () => {
  const found = sections(FIXTURE);
  assert.deepEqual(found.map((section) => [section.heading, section.level]), [
    [null, 0],
    ['Project', 1],
    ['Deploy', 2],
    ['Rollback', 3],
    ['Design', 2],
  ]);
  const by = Object.fromEntries(found.map((section) => [section.heading ?? '', section]));
  assert.equal(by[''].bytes, bytes('Read this first.\n\n'));
  // `# Project` runs to the end: no later heading is level 1 or higher.
  assert.equal(by.Project.bytes, bytes(FIXTURE.slice(FIXTURE.indexOf('# Project'))));
  // `## Deploy` holds its `### Rollback`; `## Design` holds the `####` text.
  assert.equal(by.Deploy.bytes, bytes(FIXTURE.slice(FIXTURE.indexOf('## Deploy'), FIXTURE.indexOf('## Design'))));
  assert.equal(by.Design.bytes, bytes(FIXTURE.slice(FIXTURE.indexOf('## Design'))));
  assert.equal(by.Deploy.numberedSteps, 3);
  assert.equal(by.Deploy.codeBlocks, 1);
  assert.equal(by.Rollback.numberedSteps, 0);
  assert.deepEqual(by.Rollback.paths, ['scripts/rollback.sh']);
  assert.deepEqual(by.Design.paths, ['docs/design.md', 'config_tree.py']);
  // `## Deploy` holds `### Rollback`, so its paths include Rollback's.
  assert.deepEqual(by.Deploy.paths, ['dist/', 'scripts/rollback.sh']);
  // The fenced "# not a heading" is not a heading.
  assert.ok(!found.some((section) => section.heading?.startsWith('not a heading')));
});

test('sections: no preamble entry when the file starts with a heading; a file without headings is one preamble', () => {
  assert.deepEqual(sections('# Only\n\ntext\n').map((section) => section.heading), ['Only']);
  assert.deepEqual(sections('just text\n').map((section) => [section.heading, section.level, section.bytes]), [[null, 0, 10]]);
  assert.deepEqual(sections(''), []);
});

test('check reports sections per file', () => {
  withProject({ ...CLEAN, 'AGENTS.md': FIXTURE, 'src/index.ts': '', 'dist/index.js': '', 'scripts/rollback.sh': '', 'docs/design.md': '', 'config_tree.py': '' }, (root) => {
    const report = check(root);
    const agents = report.files.find((file) => file.path === 'AGENTS.md');
    assert.equal(agents.sections.length, 5);
    assert.equal(agents.sections.reduce((sum, section) => (section.level <= 1 ? sum + section.bytes : sum), 0), agents.bytes);
    assert.deepEqual(agents.findings, []);
    const claude = report.files.find((file) => file.path === 'CLAUDE.md');
    assert.deepEqual(claude.sections.map((section) => section.heading), ['Claude Code']);
  });
});
