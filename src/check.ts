import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Codex cuts a project's instruction files here by default (`project_doc_max_bytes`). */
export const DEFAULT_MAX_BYTES = 32_768;

const INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.pnpm-store']);
const IMPORTS_AGENTS = /^\s*@(\.\/)?AGENTS\.md\s*$/m;
// A code span names a file only with one of these extensions (or a `/`):
// `config.same` or `pkg.MASKED` are code, not files.
const FILE_EXTENSIONS = new Set(
  ('md mdx txt rst json jsonc yaml yml toml ini cfg conf env lock ' +
    'ts tsx mts cts js jsx mjs cjs py sh bash ps1 bat go rs java kt swift c h cc cpp hpp cs rb php sql ' +
    'css scss html xml svg png jpg pdf tcl xdc vhd vhdl sv repl resc dml').split(' '),
);
// Characters a path in these files does not carry: `pkg>=1.2`, `user@host:/dir`, `f(x)`.
const NOT_A_PATH = /[@:=<>(),'"|!?;]/;

export type FindingKind = 'over-limit' | 'missing-claude-md' | 'no-agents-import' | 'dead-reference';

export interface Finding {
  kind: FindingKind;
  message: string;
  /** The path a dead reference names, as written. */
  ref?: string;
}

/** A heading of level 1–3 and what stands under it, up to the next heading of its level or higher. */
export interface Section {
  /** The heading text without its `#`s; null for text before the first heading. */
  heading: string | null;
  /** 1–3; 0 for the preamble. */
  level: number;
  /** The heading line through the line before the next heading of the same or a higher level. */
  bytes: number;
  /** Lines starting with `1.`, `2.`, … or `- [ ]`: a procedure shows itself this way. */
  numberedSteps: number;
  /** Fenced code blocks. */
  codeBlocks: number;
  /** The referenced paths that fall in it. */
  paths: string[];
}

export interface FileReport {
  /** Relative to the checked directory, with `/`. */
  path: string;
  bytes: number;
  chars: number;
  /** An estimate: characters / 4, rounded up. */
  tokens: number;
  findings: Finding[];
  sections: Section[];
}

export type LimitSource = 'flag' | 'package.json' | '.agents-diet.json' | 'default';

export interface Report {
  root: string;
  limit: { bytes: number; source: LimitSource };
  /** Path prefixes left out (package.json "agents-diet".ignore, else .agents-diet.json). */
  ignore: string[];
  files: FileReport[];
  summary: { files: number; bytes: number; findings: number };
}

export interface CheckOptions {
  /** Overrides the project's own limit (the `--max-bytes` flag). */
  maxBytes?: number;
}

/** A usage error: the CLI exits 2 on it. */
export class UsageError extends Error {}

function positiveInteger(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new UsageError(`${where}: the limit must be a positive integer, not ${JSON.stringify(value)}`);
  }
  return value;
}

function readJson(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new UsageError(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

/**
 * Path prefixes the project leaves out, such as copies of its instruction
 * files it keeps under version control: `package.json` "agents-diet".ignore,
 * else `.agents-diet.json` ignore. Instruction files under one are not
 * checked; references into one are not reported.
 */
export function resolveIgnore(root: string): string[] {
  const fromPackage = (readJson(join(root, 'package.json'))?.['agents-diet'] as { ignore?: unknown } | undefined)?.ignore;
  const [value, where] = fromPackage !== undefined ? [fromPackage, 'package.json "agents-diet".ignore'] : [readJson(join(root, '.agents-diet.json'))?.ignore, '.agents-diet.json ignore'];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== '')) {
    throw new UsageError(`${where}: must be a list of paths, not ${JSON.stringify(value)}`);
  }
  return value.map((entry: string) => entry.trim().replace(/^\.\//, '').replace(/\/+$/, ''));
}

const under = (path: string, prefixes: string[]) => prefixes.some((prefix) => path === prefix || path.startsWith(prefix + '/'));

/** The limit in bytes, and where it came from: the flag, package.json, .agents-diet.json, else the default. */
export function resolveLimit(root: string, options: CheckOptions = {}): Report['limit'] {
  if (options.maxBytes !== undefined) return { bytes: positiveInteger(options.maxBytes, '--max-bytes'), source: 'flag' };
  const pkg = readJson(join(root, 'package.json'));
  const fromPackage = (pkg?.['agents-diet'] as { maxBytes?: unknown } | undefined)?.maxBytes;
  if (fromPackage !== undefined) return { bytes: positiveInteger(fromPackage, 'package.json "agents-diet".maxBytes'), source: 'package.json' };
  const own = readJson(join(root, '.agents-diet.json'));
  if (own?.maxBytes !== undefined) return { bytes: positiveInteger(own.maxBytes, '.agents-diet.json maxBytes'), source: '.agents-diet.json' };
  return { bytes: DEFAULT_MAX_BYTES, source: 'default' };
}

function git(root: string, args: string[], input?: string): string | undefined {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : undefined;
}

const skipped = (path: string) => path.split('/').some((segment) => SKIPPED_DIRECTORIES.has(segment));

/**
 * Every file under root, relative to it with `/`: in a Git checkout the files
 * Git tracks or would track (.gitignore decides, so generated copies stay
 * out), else every file outside the skipped directories.
 */
export function projectFiles(root: string): string[] {
  const listed = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.']);
  if (listed !== undefined) return listed.split('\0').filter((path) => path !== '' && !skipped(path) && existsSync(join(root, path))).sort();
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (entry.isFile()) found.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return found.sort();
}

/** Every AGENTS.md and CLAUDE.md among the project's files, and .claude/CLAUDE.md. */
export function findInstructionFiles(root: string, files: string[] = projectFiles(root)): string[] {
  return files.filter((path) => {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    if (!INSTRUCTION_FILES.has(name)) return false;
    // CLAUDE.md under .claude/ is Claude Code's; AGENTS.md there is no one's.
    return !(parts.includes('.claude') && name !== 'CLAUDE.md');
  });
}

/** The paths a file names: markdown link targets and inline code spans that look like a path. */
export function referencedPaths(text: string): string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) candidates.push(match[1]);
  for (const match of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    const span = match[1].trim().replace(/:\d+(?::\d+)?$/, '');
    if (/\s/.test(span) || NOT_A_PATH.test(span)) continue;
    const name = span.split('/').filter(Boolean).pop() ?? '';
    // A bare extension (`.bit`) names a kind of file, not a file.
    if (!span.includes('/') && name.startsWith('.')) continue;
    const extension = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
    if (span.includes('/') || (extension !== undefined && FILE_EXTENSIONS.has(extension))) candidates.push(span);
  }
  for (const match of text.matchAll(/^\s*@(\S+)\s*$/gm)) candidates.push(match[1]);
  const paths = candidates
    .filter((path) => !/^[a-z][a-z0-9+.-]*:/i.test(path) && !path.startsWith('#'))
    .filter((path) => !isAbsolute(path) && !path.startsWith('~') && !/[*<{$]/.test(path))
    .map((path) => path.replace(/#.*$/, '').replace(/:\d+(?::\d+)?$/, '').replace(/[.,;:]+$/, ''))
    .filter((path) => path !== '' && !path.split('/').includes('node_modules'));
  return [...new Set(paths)];
}

/**
 * The file by its headings of level 1–3 (a heading inside a fenced block is
 * code, not a heading). Each section runs to the next heading of the same or
 * a higher level, so a `##` holds its `###`s; what a `###` holds is counted
 * in both. Text before the first heading is the preamble.
 */
export function sections(text: string): Section[] {
  const lines = text.split('\n');
  const headingAt: Array<{ line: number; level: number; heading: string }> = [];
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) headingAt.push({ line: index, level: match[1].length, heading: match[2] });
  }
  // Where each line starts in the text, so a section is a slice of the text itself.
  const starts: number[] = [0];
  for (const line of lines) starts.push(starts[starts.length - 1] + line.length + 1);
  const measure = (from: number, to: number, heading: string | null, level: number): Section => {
    const body = text.slice(starts[from], to < lines.length ? starts[to] : text.length);
    let inFence = false;
    let codeBlocks = 0;
    let numberedSteps = 0;
    for (const line of lines.slice(from, to)) {
      if (/^\s*(```|~~~)/.test(line)) {
        if (!inFence) codeBlocks += 1;
        inFence = !inFence;
        continue;
      }
      if (!inFence && /^\s*(\d+[.)]\s|- \[ \]\s)/.test(line)) numberedSteps += 1;
    }
    return { heading, level, bytes: Buffer.byteLength(body, 'utf8'), numberedSteps, codeBlocks, paths: referencedPaths(body) };
  };
  const result: Section[] = [];
  const firstHeading = headingAt[0]?.line ?? lines.length;
  if (headingAt.length === 0 || lines.slice(0, firstHeading).some((line) => line.trim() !== '')) {
    const preamble = measure(0, firstHeading, null, 0);
    if (preamble.bytes > 0) result.push(preamble);
  }
  for (const [index, start] of headingAt.entries()) {
    const next = headingAt.slice(index + 1).find((candidate) => candidate.level <= start.level);
    result.push(measure(start.line, next ? next.line : lines.length, start.heading, start.level));
  }
  return result;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Reads only: measures each instruction file under dir and lists what is wrong with it. */
export function check(dir: string, options: CheckOptions = {}): Report {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`${dir} is not a directory`);
  const limit = resolveLimit(root, options);
  const ignore = resolveIgnore(root);
  const all = projectFiles(root);
  const paths = findInstructionFiles(root, all).filter((path) => !under(path, ignore));
  const present = new Set(paths);
  const names = new Set(all.map((path) => path.split('/').pop()));

  const files = paths.map((path): FileReport => {
    const absolute = join(root, path);
    const text = readFileSync(absolute, 'utf8');
    const bytes = Buffer.byteLength(text, 'utf8');
    const chars = [...text].length;
    const findings: Finding[] = [];

    if (bytes > limit.bytes) findings.push({ kind: 'over-limit', message: `${bytes} bytes, over the limit of ${limit.bytes} (${limit.source})` });

    const directory = dirname(path) === '.' ? '' : dirname(path) + '/';
    if (path.endsWith('AGENTS.md')) {
      const beside = `${directory}CLAUDE.md`;
      const claude = present.has(beside) ? beside : directory === '' && present.has('.claude/CLAUDE.md') ? '.claude/CLAUDE.md' : undefined;
      if (!claude) {
        findings.push({ kind: 'missing-claude-md', message: `no ${beside} beside it: Claude Code does not read AGENTS.md (add a CLAUDE.md with the line @AGENTS.md)` });
      } else if (!IMPORTS_AGENTS.test(readFileSync(join(root, claude), 'utf8'))) {
        findings.push({ kind: 'no-agents-import', message: `${claude} does not import it: add the line @AGENTS.md` });
      }
    }

    const base = dirname(absolute);
    const missing = referencedPaths(text).filter((ref) => {
      if (exists(resolve(base, ref)) || exists(resolve(root, ref))) return false;
      // A file named without a directory may live anywhere in the project.
      return ref.includes('/') || !names.has(ref);
    });
    // What Git ignores is generated (build output, reports): named, not kept.
    const ignored = new Set(
      (git(root, ['check-ignore', '--stdin'], missing.map((ref) => relative(root, resolve(base, ref)).split(sep).join('/')).join('\n')) ?? '').split('\n').filter(Boolean),
    );
    for (const ref of missing) {
      const fromRoot = relative(root, resolve(base, ref)).split(sep).join('/');
      if (ignored.has(fromRoot) || under(fromRoot, ignore) || under(ref.replace(/^\.\//, ''), ignore)) continue;
      findings.push({ kind: 'dead-reference', message: `${ref} does not exist`, ref });
    }

    return { path, bytes, chars, tokens: Math.ceil(chars / 4), findings, sections: sections(text) };
  });

  return {
    root,
    limit,
    ignore,
    files,
    summary: {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      findings: files.reduce((sum, file) => sum + file.findings.length, 0),
    },
  };
}
