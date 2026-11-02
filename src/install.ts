import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError } from './check.js';

export type InstallTarget = 'claude' | 'codex';

/** Where each agent looks for a project's skills. */
export const SKILL_RELATIVE_PATHS: Record<InstallTarget, string> = {
  claude: '.claude/skills/agents-diet/SKILL.md',
  codex: '.codex/skills/agents-diet/SKILL.md',
};

export interface InstallOptions {
  /** The agents to install for; default: Claude Code, and Codex when `.codex/` exists. */
  targets?: InstallTarget[];
  /** Replace a copy the user changed. */
  force?: boolean;
}

export interface InstallResult {
  target: InstallTarget;
  path: string;
  /** written: new or the package's own earlier copy replaced; kept: a changed copy left alone; current: already this version. */
  outcome: 'written' | 'kept' | 'current';
}

const VERSION_LINE = /^agents-diet-version:\s*(\S+)\s*$/m;

/** The skill as the package ships it (skill/SKILL.md beside dist/). */
export function packagedSkill(): { text: string; version: string } {
  const path = fileURLToPath(new URL('../skill/SKILL.md', import.meta.url));
  const text = readFileSync(path, 'utf8');
  const version = VERSION_LINE.exec(text)?.[1];
  if (!version) throw new Error(`${path} has no agents-diet-version line`);
  return { text, version };
}

/** Which agents a project uses, by their directories. */
export function defaultTargets(root: string): InstallTarget[] {
  return existsSync(join(root, '.codex')) ? ['claude', 'codex'] : ['claude'];
}

/**
 * Copies the skill into the project for each target. A copy the package wrote
 * earlier (its version line says so) is replaced; a copy someone changed is
 * kept and reported, unless force.
 */
export function install(dir: string, options: InstallOptions = {}): InstallResult[] {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`${dir} is not a directory`);
  const skill = packagedSkill();
  const targets = options.targets && options.targets.length > 0 ? options.targets : defaultTargets(root);
  return targets.map((target): InstallResult => {
    const relativePath = SKILL_RELATIVE_PATHS[target];
    const path = join(root, relativePath);
    if (existsSync(path)) {
      const existing = readFileSync(path, 'utf8');
      if (existing === skill.text) return { target, path: relativePath, outcome: 'current' };
      const theirs = VERSION_LINE.exec(existing)?.[1];
      // Ours, an earlier version: replaced. Theirs, or ours and edited: kept.
      const ours = theirs !== undefined && existing === skill.text.replace(VERSION_LINE, `agents-diet-version: ${theirs}`);
      if (!ours && !options.force) return { target, path: relativePath, outcome: 'kept' };
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, skill.text, 'utf8');
    return { target, path: relativePath, outcome: 'written' };
  });
}
