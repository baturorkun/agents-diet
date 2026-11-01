import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CLEAN, withProject } from './helpers.mjs';

const cli = (...args) => spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

test('--version prints the package version; --help and no command exit 0', () => {
  const result = cli('--version');
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), version);
  assert.equal(cli('--help').status, 0);
  const bare = cli();
  assert.equal(bare.status, 0);
  assert.match(bare.stdout, /Usage: agents-diet <command>/);
});

test('check exits 0 on a clean project and prints the summary', () => {
  withProject(CLEAN, (root) => {
    const result = cli('check', root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 file\(s\), .* 0 finding\(s\); limit 32768 bytes \(default\)/);
  });
});

test('check exits 1 on findings and names them', () => {
  withProject({ 'AGENTS.md': 'See `docs/missing.md`.\n' }, (root) => {
    const result = cli('check', root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /✗ no CLAUDE\.md beside it/);
    assert.match(result.stdout, /✗ docs\/missing\.md does not exist/);
  });
});

test('--json prints the documented shape', () => {
  withProject({ 'AGENTS.md': 'x\n' }, (root) => {
    const result = cli('check', root, '--json', '--max-bytes', '1');
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report), ['root', 'limit', 'ignore', 'files', 'summary']);
    assert.deepEqual(report.limit, { bytes: 1, source: 'flag' });
    assert.deepEqual(Object.keys(report.files[0]), ['path', 'bytes', 'chars', 'tokens', 'findings']);
    assert.deepEqual(report.files[0].findings.map((finding) => finding.kind), ['over-limit', 'missing-claude-md']);
    assert.deepEqual(report.summary, { files: 1, bytes: 2, findings: 2 });
  });
});

test('usage errors exit 2: unknown command, unknown option, bad limit, not a directory', () => {
  assert.equal(cli('shrink').status, 2);
  assert.equal(cli('check', '--no-such-option').status, 2);
  assert.equal(cli('check', '.', '--max-bytes', 'ten').status, 2);
  assert.equal(cli('check', '.', '--max-bytes', '0').status, 2);
  assert.equal(cli('check', '/no/such/agents-diet/dir').status, 2);
  assert.equal(cli('check', '.', 'extra').status, 2);
});
