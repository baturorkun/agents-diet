import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { check, detectNotifyTools, formatNotice, hookCommand, installNotify, notifyMessage, parseTools, removeNotify, NOTIFY_PATHS, NOTIFY_TOOLS, UsageError } from '../dist/index.js';
import { withProject } from './helpers.mjs';

const cli = (...args) => spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });
const big = { 'AGENTS.md': `# Rules\n\n${'x'.repeat(200)}\n`, 'CLAUDE.md': '@AGENTS.md\n' };
const read = (root, tool) => JSON.parse(readFileSync(join(root, NOTIFY_PATHS[tool]), 'utf8'));
const snapshot = (root) => { const out = {}; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out[p] = readFileSync(p, 'utf8'); } }; walk(root); return out; };

test('check --notify: silent under the limit, one suggestion over it, exit 0, no file changed', () => {
  withProject(big, (root) => {
    const before = snapshot(root);
    const quiet = cli('check', root, '--notify');
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stdout, '');
    const over = cli('check', root, '--notify', '--max-bytes', '100');
    assert.equal(over.status, 0);
    assert.equal(over.stdout.trim().split('\n').length, 1);
    assert.match(over.stdout, /AGENTS\.md .*reached the size limit of 100 bytes/);
    assert.match(over.stdout, /Do not start shrinking unless the user asks/);
    assert.deepEqual(snapshot(root), before);
  });
});

test('nested AGENTS.md files over the limit together are suggested too', () => {
  withProject({ 'AGENTS.md': `${'a'.repeat(60)}\n`, 'CLAUDE.md': '@AGENTS.md\n', 'pkg/AGENTS.md': `${'b'.repeat(60)}\n`, 'pkg/CLAUDE.md': '@AGENTS.md\n' }, (root) => {
    assert.match(notifyMessage(check(root, { maxBytes: 100 })), /pkg\/AGENTS\.md .*together/);
  });
});

test('a broken project or config never blocks a session', () => {
  assert.equal(cli('check', '/no/such/agents-diet/dir', '--notify').status, 0);
  withProject({ ...big, '.agents-diet.json': '{"maxBytes":"ten"}' }, (root) => {
    const r = cli('check', root, '--notify');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
});

test('each tool gets the documented output', () => {
  const m = 'suggestion';
  assert.equal(formatNotice('claude', m), m);
  assert.equal(formatNotice('codex', m), m);
  assert.deepEqual(JSON.parse(formatNotice('gemini', m)), { systemMessage: m, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: m } });
  assert.deepEqual(JSON.parse(formatNotice('antigravity', m)), { injectSteps: [{ systemMessage: { systemMessage: m } }] });
  assert.deepEqual(JSON.parse(formatNotice('cursor', m)), { additional_context: m });
  assert.deepEqual(JSON.parse(formatNotice('copilot', m)), { additionalContext: m });
});

test('install writes each config shape, is idempotent, and remove leaves nothing', () => {
  withProject({ 'AGENTS.md': 'x\n' }, (root) => {
    assert.ok(installNotify(root, [...NOTIFY_TOOLS]).every((r) => r.outcome === 'added'));
    assert.match(read(root, 'claude').hooks.SessionStart[0].hooks[0].command, /check --notify --format claude/);
    assert.equal(read(root, 'codex').hooks.SessionStart[0].matcher, 'startup');
    assert.ok(read(root, 'gemini').hooks.SessionStart);
    assert.ok(read(root, 'antigravity')['agents-diet-notify'].SessionStart[0].command);
    assert.equal(read(root, 'cursor').version, 1);
    assert.equal(read(root, 'copilot').hooks.sessionStart[0].type, 'command');
    assert.ok(installNotify(root, [...NOTIFY_TOOLS]).every((r) => r.outcome === 'current'));
    assert.equal(read(root, 'claude').hooks.SessionStart.length, 1);
    assert.ok(removeNotify(root, [...NOTIFY_TOOLS]).every((r) => r.outcome === 'removed'));
    for (const tool of NOTIFY_TOOLS) assert.ok(!existsSync(join(root, NOTIFY_PATHS[tool])), tool);
  });
});

test('existing settings and hooks are kept, on install and on remove', () => {
  const settings = { model: 'x', hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'echo mine' }] }], Stop: [{ hooks: [] }] } };
  withProject({ '.claude/settings.json': JSON.stringify(settings) }, (root) => {
    installNotify(root, ['claude']);
    const after = read(root, 'claude');
    assert.equal(after.model, 'x');
    assert.equal(after.hooks.SessionStart.length, 2);
    assert.ok(after.hooks.Stop);
    removeNotify(root, ['claude']);
    assert.deepEqual(read(root, 'claude'), settings);
  });
});

test('an invalid config is refused and left unchanged, and no other tool is written', () => {
  withProject({ '.cursor/hooks.json': '{broken' }, (root) => {
    assert.throws(() => installNotify(root, ['claude', 'cursor']), UsageError);
    assert.equal(readFileSync(join(root, '.cursor/hooks.json'), 'utf8'), '{broken');
    assert.ok(!existsSync(join(root, NOTIFY_PATHS.claude)));
  });
});

test('plain init adds the hook for detected tools, or Claude Code when there are none', () => {
  withProject({ 'AGENTS.md': 'x\n', '.cursor/rules/a.md': 'r\n', 'GEMINI.md': '@AGENTS.md\n' }, (root) => {
    const on = cli('init', root);
    assert.equal(on.status, 0, on.stderr);
    assert.match(on.stdout, /added hook {2}\.cursor\/hooks\.json/);
    assert.match(on.stdout, /added hook {2}\.gemini\/settings\.json/);
    assert.ok(!existsSync(join(root, NOTIFY_PATHS.claude)), 'the .claude that init creates is no sign of use');
    assert.ok(!existsSync(join(root, NOTIFY_PATHS.codex)));
    assert.match(cli('init', root).stdout, /hook already there {2}\.cursor/);
    assert.equal(read(root, 'cursor').hooks.sessionStart.length, 1);
  });
  withProject({ 'AGENTS.md': 'x\n' }, (root) => {
    assert.match(cli('init', root).stdout, /added hook {2}\.claude\/settings\.json/);
    assert.equal(detectNotifyTools(root).includes('claude'), true);
  });
});

test('--claude, --agents, --no-notify, --notify-for and --remove-notify', () => {
  withProject({ '.cursor/x': '' }, (root) => {
    assert.deepEqual(detectNotifyTools(root, ['claude']), ['claude']);
    assert.deepEqual(detectNotifyTools(root, ['agents']), ['cursor']);
  });
  withProject({}, (root) => assert.deepEqual(detectNotifyTools(root, ['agents']), []));
  withProject({ 'AGENTS.md': 'x\n' }, (root) => {
    assert.equal(cli('init', root, '--no-notify').status, 0);
    assert.ok(!existsSync(join(root, NOTIFY_PATHS.claude)));
    assert.match(cli('init', root, '--notify-for', 'cursor').stdout, /added hook {2}\.cursor/);
    assert.ok(!existsSync(join(root, NOTIFY_PATHS.claude)));
    assert.match(cli('init', root, '--remove-notify', 'cursor').stdout, /removed hook/);
    assert.ok(existsSync(join(root, '.claude/skills/agents-diet/SKILL.md')), 'the skill stays');
  });
  assert.equal(cli('init', '.', '--notify-for', 'nope').status, 2);
  assert.equal(cli('init', '.', '--notify-for', 'claude', '--no-notify').status, 2);
  assert.equal(cli('check', '.', '--no-notify').status, 2);
  assert.equal(cli('check', '.', '--format', 'claude').status, 2);
  assert.equal(cli('check', '.', '--notify', '--json').status, 2);
  assert.throws(() => parseTools('claude,nope'), UsageError);
});

test('a broken config: plain init reports it and installs the skill; --notify-for is an error', () => {
  withProject({ '.claude/settings.json': '{broken' }, (root) => {
    const r = cli('init', root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /hook not added .*not valid JSON/);
    assert.equal(readFileSync(join(root, '.claude/settings.json'), 'utf8'), '{broken');
    assert.ok(existsSync(join(root, '.claude/skills/agents-diet/SKILL.md')));
    assert.equal(cli('init', root, '--notify-for', 'claude').status, 2);
  });
});

test('the hook command prints the suggestion when installed and stays silent, exit 0, when not', () => {
  withProject(big, (root) => {
    writeFileSync(join(root, '.agents-diet.json'), '{"maxBytes":100}');
    const bin = join(root, 'tools-bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'agents-diet'), `#!/bin/sh\nexec "${process.execPath}" "${resolve('dist/cli.js')}" "$@"\n`);
    chmodSync(join(bin, 'agents-diet'), 0o755);
    const env = { PATH: `${bin}:/usr/bin:/bin` };
    const found = spawnSync('/bin/sh', ['-c', hookCommand('claude')], { cwd: root, env, encoding: 'utf8' });
    assert.equal(found.status, 0, found.stderr);
    assert.match(found.stdout, /reached the size limit/);
    const missing = spawnSync('/bin/sh', ['-c', hookCommand('claude')], { cwd: root, env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
    assert.equal(missing.status, 0);
    assert.equal(missing.stdout, '');
  });
});
