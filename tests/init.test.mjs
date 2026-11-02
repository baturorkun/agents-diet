import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  // The six steps and the never-do list.
  for (const heading of ['## 1. Measure first', '## 2. Fix what is broken', '## 3. Classify every section', '## 4. Rewrite what stays', '## 5. Keep the two files in step', '## 6. Measure again and report', '## Never']) {
    assert.ok(skill.includes(`\n${heading}\n`), heading);
  }
  for (const kind of ['Delete', 'Global', 'Skill', 'Docs', 'Subdirectory', 'Keep']) assert.match(skill, new RegExp(`\\*\\*${kind}\\.\\*\\*`));
  assert.match(skill, /npx agents-diet check --json/);
  assert.match(skill, /Ask before writing\s+outside the project/);
  assert.match(skill, /Run `git commit`/);
});

test('init writes the Claude Code copy by default, and the Codex copy when .codex/ exists or --codex is given', () => {
  withProject({ 'package.json': '{}' }, (root) => {
    assert.deepEqual(init(root), [{ target: 'claude', path: SKILL_RELATIVE_PATHS.claude, outcome: 'written' }]);
    assert.equal(readFileSync(join(root, SKILL_RELATIVE_PATHS.claude), 'utf8'), skill);
    assert.ok(!existsSync(join(root, '.codex')));
  });
  withProject({ '.codex/config.toml': '' }, (root) => {
    assert.deepEqual(init(root).map((result) => [result.target, result.outcome]), [['claude', 'written'], ['codex', 'written']]);
    assert.equal(readFileSync(join(root, SKILL_RELATIVE_PATHS.codex), 'utf8'), skill);
  });
  withProject({}, (root) => {
    assert.deepEqual(init(root, { targets: ['codex'] }).map((result) => result.target), ['codex']);
    assert.ok(!existsSync(join(root, '.claude')));
  });
});

test('init replaces only its own earlier copy; a changed copy is kept unless --force', () => {
  withProject({}, (root) => {
    const path = join(root, SKILL_RELATIVE_PATHS.claude);
    mkdirSync(join(root, '.claude/skills/agents-diet'), { recursive: true });
    // Ours, from an earlier version: replaced.
    writeFileSync(path, skill.replace(/^agents-diet-version: .*$/m, 'agents-diet-version: 0.0.1'));
    assert.equal(init(root)[0].outcome, 'written');
    assert.equal(readFileSync(path, 'utf8'), skill);
    // Already this version: current, untouched.
    assert.equal(init(root)[0].outcome, 'current');
    // Edited by the project: kept, then replaced with force.
    writeFileSync(path, skill + '\n- Also: never touch the CSS.\n');
    assert.equal(init(root)[0].outcome, 'kept');
    assert.match(readFileSync(path, 'utf8'), /never touch the CSS/);
    assert.equal(init(root, { force: true })[0].outcome, 'written');
    assert.equal(readFileSync(path, 'utf8'), skill);
    // Someone else's skill of the same name: kept.
    writeFileSync(path, '---\nname: agents-diet\n---\nmine\n');
    assert.equal(init(root)[0].outcome, 'kept');
  });
});

test('init from the CLI: says what it did, exits 2 on usage errors; install is no command', () => {
  withProject({ '.codex/config.toml': '' }, (root) => {
    const first = cli('init', root);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /^wrote {2}\.claude\/skills\/agents-diet\/SKILL\.md$/m);
    assert.match(first.stdout, /^wrote {2}\.codex\/skills\/agents-diet\/SKILL\.md$/m);
    const again = cli('init', root, '--claude');
    assert.match(again.stdout, /^already current {2}\.claude/m);
    assert.doesNotMatch(again.stdout, /codex/);
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
  assert.throws(() => init('/no/such/agents-diet/dir'), UsageError);
});
