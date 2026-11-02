import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('bin paths are relative without ./ and point at built files', () => {
  // npm 11 drops a bin whose path starts with ./ from the registry manifest
  // ("script name … was invalid and removed"): the package installs, the
  // command does not. A local install reads the tarball and never shows it.
  const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin;
  assert.ok(bins && Object.keys(bins).length > 0, 'package.json has a bin');
  for (const [name, path] of Object.entries(bins)) {
    assert.doesNotMatch(path, /^\.?\//, `bin[${name}] "${path}" starts with ./ or /`);
    assert.ok(existsSync(path), `bin[${name}] "${path}" is not built`);
  }
});
