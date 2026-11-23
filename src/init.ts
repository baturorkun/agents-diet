import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
/** Beside each installed skill: what init wrote, so an unedited copy can be told from an edited one. */
export const SKILL_MANIFEST = '.agents-diet-manifest.json';

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** The recorded files, or null when there is no usable manifest. Paths leaving the folder are not trusted. */
function readManifest(skillDir: string): Record<string, string> | null {
  try {
    const files = (JSON.parse(readFileSync(join(skillDir, SKILL_MANIFEST), 'utf8')) as { files?: unknown }).files;
    if (typeof files !== 'object' || files === null || Array.isArray(files)) return null;
    const entries = Object.entries(files);
    const safe = entries.every(([file, hash]) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash) && resolve(skillDir, file).startsWith(resolve(skillDir) + sep));
    return safe && entries.length > 0 ? (files as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function writeManifest(skillDir: string, version: string, shipped: string[]): void {
  const files = Object.fromEntries(shipped.map((file) => [file, sha256(join(skillDir, file))]));
  writeFileSync(join(skillDir, SKILL_MANIFEST), `${JSON.stringify({ version, files }, null, 2)}\n`);
}

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
      if (existing === skill.text && referencesCurrent) {
        if (!readManifest(skillDir)) writeManifest(skillDir, skill.version, skill.files);
        return { target, path: relativePath, outcome: 'current' };
      }
      const manifest = readManifest(skillDir);
      const theirs = VERSION_LINE.exec(existing)?.[1];
      // With a manifest: unedited when every file still there matches it (a missing one is restored).
      // Without one (an install before RQ-L10): ours only if nothing but the version line differs.
      const unedited = manifest
        ? Object.entries(manifest).every(([file, hash]) => !existsSync(join(skillDir, file)) || sha256(join(skillDir, file)) === hash)
        : theirs !== undefined && existing === skill.text.replace(VERSION_LINE, `agents-diet-version: ${theirs}`);
      if (!unedited && !options.force) return { target, path: relativePath, outcome: 'kept' };
      // A file an earlier version shipped and this one does not: removed only if it is unedited.
      for (const [file, hash] of Object.entries(manifest ?? {})) {
        const old = join(skillDir, file);
        if (!skill.files.includes(file) && existsSync(old) && sha256(old) === hash) rmSync(old);
      }
    }
    for (const file of skill.files) {
      mkdirSync(dirname(join(skillDir, file)), { recursive: true });
      writeFileSync(join(skillDir, file), readFileSync(join(skill.dir, file)));
    }
    writeManifest(skillDir, skill.version, skill.files);
    return { target, path: relativePath, outcome: 'written' };
  });
}
