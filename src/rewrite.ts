import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { UsageError } from './check.js';

/** Where candidates lived before RQ-L13; only `discard` still accepts a leftover here. */
const LEGACY_DIR = '.agents-diet-rewrite';

/** The visible file a rewrite is written to, beside the original: CLAUDE.md -> CLAUDE.rewrite.md. */
export const candidateFor = (file: string): string => join(dirname(file), `${basename(file).replace(/\.mdx?$/i, '')}.rewrite.md`);

export interface RewriteSection {
  /** 1-based position, internal: the user only ever sees headings. */
  index: number;
  heading: string | null;
  beforeBytes: number;
  afterBytes: number;
  savedBytes: number;
  status: 'unchanged' | 'accepted' | 'rejected';
  reasons: string[];
  /** Protected items the candidate lost. */
  missing: string[];
}

export interface RewriteReport {
  /** False when the candidate added, removed, renamed or reordered a heading: nothing can be applied. */
  structureOk: boolean;
  sections: RewriteSection[];
  acceptedBytes: number;
}

export interface RewritePreview {
  beforeBytes: number;
  afterBytes: number;
  canApply: boolean;
  /** The new file is the same as the original: no rewrite was written. */
  identical: boolean;
  shortened: { heading: string; beforeBytes: number; afterBytes: number; changedLines: number; changes: { type: 'removed' | 'added'; text: string }[] }[];
  kept: { heading: string; why: string; missing: string[] }[];
}

const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^#{1,6}\s+\S/;

/** Splits into sections at headings outside code fences. Joined back they are the exact text. */
export function splitSections(text: string): { heading: string | null; text: string }[] {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const out: { heading: string | null; text: string }[] = [];
  let current: { heading: string | null; text: string } = { heading: null, text: '' };
  let fence: string | null = null;
  let inFrontmatter = lines[0]?.trimEnd() === '---';
  lines.forEach((line, i) => {
    if (inFrontmatter) {
      current.text += line;
      if (i > 0 && line.trimEnd() === '---') inFrontmatter = false;
      return;
    }
    const mark = FENCE.exec(line)?.[1];
    if (mark) {
      if (fence === null) fence = mark[0]!;
      else if (mark[0] === fence) fence = null;
    } else if (fence === null && HEADING.test(line)) {
      if (current.text !== '') out.push(current);
      current = { heading: line.trimEnd(), text: '' };
    }
    current.text += line;
  });
  if (current.text !== '' || out.length === 0) out.push(current);
  return out;
}

// The words that carry a rule's force or exception. Other common words may go (RQ-L15).
const WORDS = [
  'never', 'do not', "don't", 'cannot', "can't", 'must not', 'forbidden', 'prohibited', 'asla', 'yasak',
  'must', 'required', 'mutlaka', 'zorunlu',
  'unless', 'except', 'only if', 'only when', 'hariç',
];
const WORD = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${WORDS.map((w) => w.replace(/ /g, '\\s+')).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
// A line is locked only for a real secret value or a security rule; `auth` or `token` alone is not enough (RQ-L12).
const SECRET_ASSIGNMENT = /([\w-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[\w-]*\s*[:=]\s*["'`]?)([^\s"'`]{6,})/gi;
const SECRET_VALUE = /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const SECURITY_TERM = /secret|credential|passw|token|api[_-]?key|private key|permission|security|\bauth|güvenlik|şifre|parola/i;
const RULE_WORD = /\b(?:never|must|always|only|do not|don't|cannot|can't|required|forbidden|prohibited|avoid|keep|redact|mask|asla|mutlaka|daima|yalnızca|sadece|zorunlu|yasak)\b/i;
const hasSecret = (line: string): boolean => new RegExp(SECRET_ASSIGNMENT.source, 'i').test(line) || new RegExp(SECRET_VALUE.source).test(line);
const isSensitive = (line: string): boolean => hasSecret(line) || (SECURITY_TERM.test(line) && RULE_WORD.test(line));
/** The text with secret values masked, for anything printed. */
const mask = (text: string): string => text.replace(SECRET_ASSIGNMENT, '$1••••').replace(SECRET_VALUE, '••••');
const EXTENSION = 'md|mdx|json|ya?ml|toml|lock|txt|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|c|h|cpp|cs|sh|bash|zsh|sql|html|css|xml|env|ini|cfg|gradle';
const LITERALS: RegExp[] = [
  /`+[^`\n]+`+/g, // inline code
  /https?:\/\/[^\s)>\]]+/g, // URLs
  /\]\([^)\s]+\)/g, // link targets
  /(?<![\w/.-])(?:~|\.{1,2})?\/?[\w@.-]+(?:\/[\w@.-]+)+\/?/g, // paths
  new RegExp(`(?<![\\w.-])[\\w-]+\\.(?:${EXTENSION})(?![\\w-])`, 'gi'), // file names
  /\$?\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, // environment variables
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, // snake_case
  /\b[a-z]+[a-z0-9]*[A-Z][A-Za-z0-9]*\b/g, // camelCase
  /\b[A-Za-z_][\w.]*\(\)/g, // calls
  /(?<![\w.])\d+(?:[.,:]\d+)*(?:\s?(?:%|[KMG]i?B|ms|sec|min))?/g, // numbers, versions, limits
];

interface Protected {
  /** Items that must keep their count, in first-seen order. */
  literals: Map<string, number>;
  words: Map<string, number>;
  /** Whole lines that may not change at all. */
  exact: string[];
}

const bump = (map: Map<string, number>, key: string): void => { map.set(key, (map.get(key) ?? 0) + 1); };
const normal = (text: string): string => text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** `don't` and `do not` are the same protected word, as are `can't` and `cannot`. */
const wordKey = (text: string): string => ({ "don't": 'do not', "can't": 'cannot' })[normal(text)] ?? normal(text);

/** Drops a sentence that repeats an earlier one of the section, so removing the repeat loses nothing. */
function withoutRepeats(prose: string): string {
  const seen = new Set<string>();
  return prose.replace(/[^.!?\n]+[.!?]*/g, (sentence) => {
    const key = normal(sentence);
    if (key.length < 20) return sentence;
    if (seen.has(key)) return '';
    seen.add(key);
    return sentence;
  });
}

/** What a rewrite of this text must keep. */
export function protectedItems(text: string): Protected {
  const out: Protected = { literals: new Map(), words: new Map(), exact: [] };
  const prose: string[] = [];
  let fence: string | null = null;
  let block: string[] = [];
  const lines = text.split('\n');
  let inFrontmatter = lines[0]?.trimEnd() === '---';
  lines.forEach((line, i) => {
    if (inFrontmatter) {
      out.exact.push(line);
      if (i > 0 && line.trimEnd() === '---') inFrontmatter = false;
      return;
    }
    const mark = FENCE.exec(line)?.[1];
    if (fence !== null || mark) {
      block.push(line);
      if (fence === null) fence = mark![0]!;
      else if (mark?.[0] === fence) { out.exact.push(...block); block = []; fence = null; }
      return;
    }
    if (HEADING.test(line) || /^\s*@\S+\s*$/.test(line) || isSensitive(line)) { if (line.trim()) out.exact.push(line); return; }
    prose.push(line);
  });
  out.exact.push(...block);
  const unique = withoutRepeats(prose.join('\n')).replace(/[’‘]/g, "'");
  const found: { at: number; value: string }[] = [];
  for (const pattern of LITERALS) for (const m of unique.matchAll(pattern)) found.push({ at: m.index, value: m[0].replace(/[.,:;]+$/, '') });
  for (const item of found.sort((a, b) => a.at - b.at)) bump(out.literals, item.value);
  for (const m of unique.matchAll(WORD)) bump(out.words, wordKey(m[0]));
  return out;
}

/** The numbered steps outside code fences, each with its indented continuation lines. */
function procedureSteps(text: string): { number: string; text: string }[] {
  const steps: { number: string; text: string }[] = [];
  let fence: string | null = null;
  let current: { number: string; text: string } | null = null;
  for (const line of text.split('\n')) {
    const mark = FENCE.exec(line)?.[1];
    if (mark) {
      if (fence === null) fence = mark[0]!;
      else if (mark[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const step = /^\s*(\d+)[.)]\s/.exec(line);
    if (step) {
      current = { number: step[1]!, text: line };
      steps.push(current);
    } else if (current && /^\s+\S/.test(line)) current.text += `\n${line}`;
    else if (line.trim() !== '') current = null;
  }
  return steps;
}

function compareSection(before: string, after: string): { reasons: string[]; missing: string[] } {
  const a = protectedItems(before);
  const b = protectedItems(after);
  const missing: string[] = [];
  const afterLines = new Set(after.split('\n'));
  for (const line of a.exact) if (!afterLines.has(line)) missing.push(`line: ${mask(line.trim())}`);
  for (const [value, count] of a.literals) if ((b.literals.get(value) ?? 0) < count && !(after.split(value).length - 1 >= count)) missing.push(mask(value));
  for (const [word, count] of a.words) if ((b.words.get(word) ?? 0) < count) missing.push(`word: ${word}`);
  const reasons: string[] = [];
  if (missing.length > 0) reasons.push('a protected item changed or is missing');
  // Procedure steps keep their number and order, and each keeps its own protected items.
  const stepsBefore = procedureSteps(before);
  const stepsAfter = procedureSteps(after);
  if (stepsBefore.length !== stepsAfter.length || stepsBefore.some((s, i) => s.number !== stepsAfter[i]!.number)) reasons.push('the number or order of procedure steps changed');
  else if (stepsBefore.some((s, i) => [...protectedItems(s.text).literals.keys()].some((value) => !stepsAfter[i]!.text.includes(value)))) reasons.push('a procedure step lost a protected item or it moved to another step');
  const saved = bytes(before) - bytes(after);
  if (saved < 0) reasons.push('the section grew');
  else if (saved === 0) reasons.push('the section did not get shorter');
  return { reasons, missing };
}

/** Compares a file with a rewrite candidate, section by section. Reads and decides only. */
export function compareRewrite(before: string, after: string): RewriteReport {
  const a = splitSections(before);
  const b = splitSections(after);
  const structureOk = a.length === b.length && a.every((s, i) => s.heading === b[i]!.heading);
  const sections = a.map((section, i): RewriteSection => {
    const candidate = structureOk ? b[i]!.text : section.text;
    const base = { index: i + 1, heading: section.heading, beforeBytes: bytes(section.text), afterBytes: bytes(candidate), savedBytes: bytes(section.text) - bytes(candidate) };
    if (!structureOk) return { ...base, status: 'rejected', reasons: ['the candidate changed the headings'], missing: [] };
    if (candidate === section.text) return { ...base, status: 'unchanged', reasons: [], missing: [] };
    const { reasons, missing } = compareSection(section.text, candidate);
    return { ...base, status: reasons.length === 0 ? 'accepted' : 'rejected', reasons, missing };
  });
  const acceptedBytes = sections.filter((s) => s.status === 'accepted').reduce((sum, s) => sum + s.savedBytes, 0);
  return { structureOk, sections, acceptedBytes };
}

const headingName = (heading: string | null): string => (heading === null ? '(before the first heading)' : heading.replace(/^#+\s*/, '').trim());
const nameKey = (name: string): string => name.replace(/^#+\s*/, '').trim().toLowerCase();

/** The file with every accepted section from the candidate, except those named in `exclude`. */
export function mergeRewrite(before: string, after: string, exclude: string[] = []): string {
  const report = compareRewrite(before, after);
  if (!report.structureOk) throw new UsageError('the candidate changed the headings; nothing can be applied');
  const skip = new Set(exclude.map(nameKey));
  const known = new Set(report.sections.map((s) => nameKey(headingName(s.heading))));
  for (const name of exclude) if (!known.has(nameKey(name))) throw new UsageError(`--exclude: no section is named "${name}"`);
  const chosen = report.sections.filter((s) => s.status === 'accepted' && !skip.has(nameKey(headingName(s.heading))));
  if (chosen.length === 0) throw new UsageError('there is no accepted section to apply');
  const indexes = new Set(chosen.map((s) => s.index));
  const a = splitSections(before);
  const b = splitSections(after);
  return a.map((s, i) => (indexes.has(i + 1) ? b[i]!.text : s.text)).join('');
}

/** The changed lines of a section, by longest common subsequence. Secret values are masked. */
function changedLines(before: string, after: string): { type: 'removed' | 'added'; text: string }[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: { type: 'removed' | 'added'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i += 1; j += 1; } else if (j >= b.length || (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!)) { out.push({ type: 'removed', text: mask(a[i]!) }); i += 1; } else { out.push({ type: 'added', text: mask(b[j]!) }); j += 1; }
  }
  return out.filter((line) => line.text.trim() !== '');
}

function whyKept(text: string): string {
  const lines = text.split('\n');
  if (lines.some(isSensitive)) return 'security rule or secret, protected';
  const prose = lines.filter((line) => line.trim() && !HEADING.test(line) && !FENCE.test(line));
  if (text.includes('```') && prose.length <= 2) return 'code, protected';
  return 'no change proposed';
}

/** What a rewrite would do, by section heading. Reads and decides only. */
export function previewRewrite(before: string, after: string): RewritePreview {
  const report = compareRewrite(before, after);
  const a = splitSections(before);
  const b = splitSections(after);
  const canApply = report.structureOk && report.acceptedBytes > 0;
  const shortened: RewritePreview['shortened'] = [];
  const kept: RewritePreview['kept'] = [];
  report.sections.forEach((s, i) => {
    const heading = headingName(s.heading);
    if (canApply && s.status === 'accepted') {
      const changes = changedLines(a[i]!.text, b[i]!.text);
      shortened.push({ heading, beforeBytes: s.beforeBytes, afterBytes: s.afterBytes, changedLines: changes.filter((c) => c.type === 'removed').length, changes });
    } else if (s.status === 'rejected') kept.push({ heading, why: s.reasons.join('; '), missing: s.missing });
    else kept.push({ heading, why: whyKept(a[i]!.text), missing: [] });
  });
  return { beforeBytes: bytes(before), afterBytes: bytes(before) - (canApply ? report.acceptedBytes : 0), canApply, identical: before === after, shortened, kept };
}

/** The candidate of `file`: only its own `<name>.rewrite.md` beside it. */
function candidatePath(path: string, file: string): string {
  const full = resolve(path);
  const expected = resolve(candidateFor(file));
  if (full !== expected) throw new UsageError(`${path}: the new file for ${file} must be ${candidateFor(file)}`);
  if (!existsSync(full) || !statSync(full).isFile()) throw new UsageError(`${path} is not a file`);
  return full;
}

/** Only a `.rewrite.md` with its original beside it, or a leftover under the old folder, can be removed. */
function discardable(path: string): string {
  const full = resolve(path);
  if (!existsSync(full) || !statSync(full).isFile()) throw new UsageError(`${path} is not a file`);
  if (full.split(sep).includes(LEGACY_DIR)) return full;
  const original = full.replace(/\.rewrite\.md$/, '.md');
  if (original === full || !existsSync(original)) throw new UsageError(`${path}: only a <name>.rewrite.md beside its original can be discarded`);
  return full;
}

function removeCandidate(full: string): void {
  rmSync(full);
  // A leftover under the old folder: remove the emptied folders too.
  for (let dir = dirname(full); dir.split(sep).includes(LEGACY_DIR); dir = dirname(dir)) {
    if (readdirSync(dir).length > 0) break;
    rmdirSync(dir);
  }
}

function inGit(path: string): boolean {
  for (let dir = dirname(resolve(path)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return true;
    if (dirname(dir) === dir) return false;
  }
}

export function rewriteCheck(file: string, candidate: string): RewriteReport {
  if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`${file} is not a file`);
  return compareRewrite(readFileSync(file, 'utf8'), readFileSync(candidatePath(candidate, file), 'utf8'));
}

export function rewritePreview(file: string, candidate: string): RewritePreview {
  if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`${file} is not a file`);
  return previewRewrite(readFileSync(file, 'utf8'), readFileSync(candidatePath(candidate, file), 'utf8'));
}

/** Applies every accepted section except the excluded headings and removes the candidate. Without Git, keeps the original beside the file. */
export function rewriteApply(file: string, candidate: string, exclude: string[] = []): { savedBytes: number; backup: string | null } {
  rewriteCheck(file, candidate);
  const full = candidatePath(candidate, file);
  const before = readFileSync(file, 'utf8');
  const merged = mergeRewrite(before, readFileSync(full, 'utf8'), exclude);
  let backup: string | null = null;
  if (!inGit(file)) {
    backup = join(dirname(file), `${basename(file)}.before-rewrite`);
    if (existsSync(backup)) throw new UsageError(`${backup} already exists; move it first`);
    writeFileSync(backup, before);
  }
  writeFileSync(file, merged);
  removeCandidate(full);
  return { savedBytes: bytes(before) - bytes(merged), backup };
}

export function rewriteDiscard(candidate: string): void {
  removeCandidate(discardable(candidate));
}
