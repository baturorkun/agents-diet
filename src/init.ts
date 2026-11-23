import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError } from './check.js';

/**
 * Where the skill goes. `agents` is the shared location of the Agent Skills standard, read by
 * Codex, Gemini CLI, Antigravity, Cursor and GitHub Copilot; `claude` is Claude Code's own.
 * Codex reads `.agents/skills/`, not `.codex/skills/` (RQ-L02).
 */
export type InitTarget = 'agents' | 'claude';

/** Where each target looks for a project's skills: the path of the skill's SKILL.md. */
export const SKILL_RELATIVE_PATHS: Record<InitTarget, string> = {
  agents: '.agents/skills/agents-diet/SKILL.md',
  claude: '.claude/skills/agents-diet/SKILL.md',
};

export interface InitOptions {
  /** The targets to set up; default: all of them. */
  targets?: InitTarget[];
  /** Replace a copy the user changed. */
  force?: boolean;
}

export interface InitResult {
  target: InitTarget;
  /** The installed SKILL.md, relative to the project. */
  path: string;
  /** written: new or the package's own earlier copy replaced; kept: a changed copy left alone; current: already this version. */
  outcome: 'written' | 'kept' | 'current';
}

const VERSION_LINE = /^agents-diet-version:\s*(\S+)\s*$/m;

/** The skill as the package ships it: skill/ beside dist/, SKILL.md and everything under it (references/). */
export function packagedSkill(): { dir: string; text: string; version: string; files: string[] } {
  const dir = fileURLToPath(new URL('../skill/', import.meta.url));
  const text = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const version = VERSION_LINE.exec(text)?.[1];
  if (!version) throw new Error(`${join(dir, 'SKILL.md')} has no agents-diet-version line`);
  const files: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return { dir, text, version, files: files.sort() };
}

/** All targets: each agent reads one of the two locations, so both are always set up. */
export function defaultTargets(): InitTarget[] {
  return ['agents', 'claude'];
}

/**
 * Copies the skill, SKILL.md and its references, into the project for each target. A copy the
 * package wrote earlier (its version line says so) is replaced; a copy someone changed is kept
 * with its references and reported, unless force.
 */
export function init(dir: string, options: InitOptions = {}): InitResult[] {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`${dir} is not a directory`);
  const skill = packagedSkill();
  const targets = options.targets && options.targets.length > 0 ? [...new Set(options.targets)] : defaultTargets();
  return targets.map((target): InitResult => {
    const relativePath = SKILL_RELATIVE_PATHS[target];
    const path = join(root, relativePath);
    const skillDir = dirname(path);
    if (existsSync(path)) {
      const existing = readFileSync(path, 'utf8');
      const referencesCurrent = skill.files.every((file) => existsSync(join(skillDir, file)) && readFileSync(join(skillDir, file), 'utf8') === readFileSync(join(skill.dir, file), 'utf8'));
      if (existing === skill.text && referencesCurrent) return { target, path: relativePath, outcome: 'current' };
      const theirs = VERSION_LINE.exec(existing)?.[1];
      // Ours, an earlier version (or this one with references missing): replaced. Theirs, or ours and edited: kept.
      const ours = theirs !== undefined && existing === skill.text.replace(VERSION_LINE, `agents-diet-version: ${theirs}`);
      if (!ours && !options.force) return { target, path: relativePath, outcome: 'kept' };
    }
    for (const file of skill.files) {
      mkdirSync(dirname(join(skillDir, file)), { recursive: true });
      writeFileSync(join(skillDir, file), readFileSync(join(skill.dir, file)));
    }
    return { target, path: relativePath, outcome: 'written' };
  });
}
