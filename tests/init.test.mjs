import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { init, SKILL_RELATIVE_PATHS, UsageError } from '../dist/index.js';
import { withProject } from './helpers.mjs';

const skill = readFileSync('skill/SKILL.md', 'utf8');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const cli = (...args) => spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });

test('the shipped skill names itself, triggers on shrinking, and carries the package version', () => {
  const frontmatter = skill.split('---')[1];
  assert.match(frontmatter, /^name: agents-diet$/m);
  assert.match(frontmatter, /^description: .*(shrink|smaller).*$/m);
  assert.match(frontmatter, new RegExp(`^agents-diet-version: ${version.replace(/\./g, '\\.')}$`, 'm'), 'bump agents-diet-version in skill/SKILL.md with package.json');
  // The limits first, then the six steps in the order they run (RQ-L01).
  for (const heading of ['## Limits', '## 1. Measure', '## 2. Fix what is broken', '## 3. Classify every section', '## 4. Ask before you change', '## 5. Apply', '## 6. Report']) {
    assert.ok(skill.includes(`\n${heading}\n`), heading);
  }
  assert.ok(skill.indexOf('## Limits') < skill.indexOf('## 1. Measure'), 'the limits come first');
  for (const kind of ['Delete', 'Global', 'Skill', 'Docs', 'Subdirectory', 'Keep']) assert.match(skill, new RegExp(`\\*\\*${kind}:\\*\\*`));
  assert.match(skill, /npx agents-diet check --json/);
  assert.match(skill, /Never write outside the project/);
  assert.match(skill, /Move text word for word/);
  assert.match(skill, /Never commit, push or publish/);
  // The references the skill points to ship with it.
  for (const reference of ['references/examples.md', 'references/anti-patterns.md']) {
    assert.ok(skill.includes(reference), reference);
    assert.ok(existsSync(join('skill', reference)), `skill/${reference} exists`);
  }
});

test('init writes both locations by default, with the references; --claude or --agents alone (RQ-L02)', () => {
  withProject({ 'package.json': '{}' }, (root) => {
    assert.deepEqual(init(root), [
      { target: 'agents', path: SKILL_RELATIVE_PATHS.agents, outcome: 'written' },
      { target: 'claude', path: SKILL_RELATIVE_PATHS.claude, outcome: 'written' },
    ]);
    for (const target of ['agents', 'claude']) {
      const dir = dirname(join(root, SKILL_RELATIVE_PATHS[target]));
      assert.equal(readFileSync(join(dir, 'SKILL.md'), 'utf8'), skill);
      for (const reference of ['references/examples.md', 'references/anti-patterns.md']) {
        assert.equal(readFileSync(join(dir, reference), 'utf8'), readFileSync(join('skill', reference), 'utf8'), `${target} ${reference}`);
      }
    }
    assert.ok(!existsSync(join(root, '.codex')), 'nothing goes to .codex/skills: Codex reads .agents/skills');
  });
  withProject({}, (root) => {
    assert.deepEqual(init(root, { targets: ['claude'] }).map((result) => result.target), ['claude']);
    assert.ok(!existsSync(join(root, '.agents')));
  });
  withProject({}, (root) => {
    assert.deepEqual(init(root, { targets: ['agents'] }).map((result) => result.target), ['agents']);
    assert.ok(!existsSync(join(root, '.claude')));
  });
});

test('a missing reference makes the package\'s own copy out of date, so init writes it again', () => {
  withProject({}, (root) => {
    init(root, { targets: ['claude'] });
    const dir = dirname(join(root, SKILL_RELATIVE_PATHS.claude));
    rmSync(join(dir, 'references/examples.md'));
    assert.equal(init(root, { targets: ['claude'] })[0].outcome, 'written');
    assert.ok(existsSync(join(dir, 'references/examples.md')));
  });
});

test('init replaces only its own earlier copy; a changed copy is kept unless --force', () => {
  withProject({}, (root) => {
    const path = join(root, SKILL_RELATIVE_PATHS.claude);
    mkdirSync(join(root, '.claude/skills/agents-diet'), { recursive: true });
    // Ours, from an earlier version: replaced.
    writeFileSync(path, skill.replace(/^agents-diet-version: .*$/m, 'agents-diet-version: 0.0.1'));
    assert.equal(init(root, { targets: ['claude'] })[0].outcome, 'written');
    assert.equal(readFileSync(path, 'utf8'), skill);
    // Already this version: current, untouched.
    assert.equal(init(root, { targets: ['claude'] })[0].outcome, 'current');
    // Edited by the project: kept, then replaced with force.
    writeFileSync(path, skill + '\n- Also: never touch the CSS.\n');
    assert.equal(init(root, { targets: ['claude'] })[0].outcome, 'kept');
    assert.match(readFileSync(path, 'utf8'), /never touch the CSS/);
    assert.equal(init(root, { targets: ['claude'], force: true })[0].outcome, 'written');
    assert.equal(readFileSync(path, 'utf8'), skill);
    // Someone else's skill of the same name: kept.
    writeFileSync(path, '---\nname: agents-diet\n---\nmine\n');
    assert.equal(init(root, { targets: ['claude'] })[0].outcome, 'kept');
  });
});

test('init from the CLI: says what it did, exits 2 on usage errors; install is no command', () => {
  withProject({}, (root) => {
    const first = cli('init', root);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /^wrote {2}\.agents\/skills\/agents-diet\/SKILL\.md$/m);
    assert.match(first.stdout, /^wrote {2}\.claude\/skills\/agents-diet\/SKILL\.md$/m);
    const again = cli('init', root, '--claude');
    assert.match(again.stdout, /^already current {2}\.claude/m);
    assert.doesNotMatch(again.stdout, /\.agents/);
    // --codex, kept from 0.1.0, now means .agents/skills/.
    assert.match(cli('init', root, '--codex').stdout, /^already current {2}\.agents/m);
    writeFileSync(join(root, SKILL_RELATIVE_PATHS.claude), 'changed\n');
    assert.match(cli('init', root, '--claude').stdout, /^kept \(changed here; --force replaces it\)/m);
    assert.match(cli('init', root, '--claude', '--force').stdout, /^wrote/m);
  });
  assert.equal(cli('init', '/no/such/agents-diet/dir').status, 2);
  const old = cli('install', '.');
  assert.equal(old.status, 2);
  assert.match(old.stderr, /Unknown command: install/);
  assert.equal(cli('init', '.', '--json').status, 2);
  assert.equal(cli('check', '.', '--force').status, 2);
  assert.equal(cli('check', '.', '--agents').status, 2);
  assert.throws(() => init('/no/such/agents-diet/dir'), UsageError);
});
