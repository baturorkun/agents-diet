import { existsSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { UsageError } from './check.js';

/** A section may lose at most this share of its bytes; more suggests lost content (RQ-L08). */
export const MAX_REDUCTION = 0.3;
/** A smaller saving is not worth touching the text. */
export const MIN_SAVED_BYTES = 100;
/** Candidates live here until applied or discarded; nothing else is ever deleted. */
export const CANDIDATE_DIR = '.agents-diet-rewrite';

export interface RewriteSection {
  /** 1-based, the number `--sections` takes. */
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

const WORDS = [
  // The force of a rule.
  'must', 'never', 'always', 'only', 'should', 'shall', 'required', 'requires', 'require', 'cannot', "can't", "don't", "doesn't", "won't", 'not', 'no', 'avoid', 'forbidden', 'prohibited',
  'asla', 'mutlaka', 'daima', 'her zaman', 'yalnızca', 'sadece', 'zorunlu', 'yasak', 'değil',
  // Conditions, exceptions, order and reasons.
  'if', 'unless', 'except', 'when', 'whenever', 'until', 'before', 'after', 'first', 'then', 'while', 'otherwise', 'because', 'since',
  'eğer', 'ancak', 'hariç', 'önce', 'sonra', 'yoksa', 'çünkü',
];
const WORD = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${WORDS.map((w) => w.replace(/ /g, '\\s+')).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
const SENSITIVE = /secret|credential|passw|token|api[_-]?key|private key|permission|security|\bauth|güvenlik|şifre|parola/i;
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
    if (HEADING.test(line) || /^\s*@\S+\s*$/.test(line) || /^\s*\d+[.)]\s/.test(line) || SENSITIVE.test(line)) { if (line.trim()) out.exact.push(line); return; }
    prose.push(line);
  });
  out.exact.push(...block);
  const unique = withoutRepeats(prose.join('\n')).replace(/[’‘]/g, "'");
  const found: { at: number; value: string }[] = [];
  for (const pattern of LITERALS) for (const m of unique.matchAll(pattern)) found.push({ at: m.index, value: m[0].replace(/[.,:;]+$/, '') });
  for (const item of found.sort((a, b) => a.at - b.at)) bump(out.literals, item.value);
  for (const m of unique.matchAll(WORD)) bump(out.words, normal(m[0]));
  return out;
}

function compareSection(before: string, after: string): { reasons: string[]; missing: string[] } {
  const a = protectedItems(before);
  const b = protectedItems(after);
  const missing: string[] = [];
  const afterLines = new Set(after.split('\n'));
  for (const line of a.exact) if (!afterLines.has(line)) missing.push(`line: ${line.trim()}`);
  for (const [value, count] of a.literals) if ((b.literals.get(value) ?? 0) < count && !(after.split(value).length - 1 >= count)) missing.push(value);
  for (const [word, count] of a.words) if ((b.words.get(word) ?? 0) < count) missing.push(`word: ${word}`);
  const reasons: string[] = [];
  if (missing.length > 0) reasons.push('a protected item changed or is missing');
  // Protected values keep their relative order.
  let from = -1;
  for (const value of a.literals.keys()) {
    const at = after.indexOf(value);
    if (at === -1) continue;
    if (at < from) { reasons.push('the order of protected items changed'); break; }
    from = at;
  }
  const saved = bytes(before) - bytes(after);
  if (saved < 0) reasons.push('the section grew');
  else if (saved < MIN_SAVED_BYTES) reasons.push(`saves ${saved} bytes, under the minimum of ${MIN_SAVED_BYTES}`);
  if (saved / bytes(before) > MAX_REDUCTION) reasons.push(`shrinks by ${Math.round((100 * saved) / bytes(before))}%, over the limit of ${MAX_REDUCTION * 100}%`);
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
  return { structureOk, sections, acceptedBytes: sections.filter((s) => s.status === 'accepted').reduce((sum, s) => sum + s.savedBytes, 0) };
}

/** The file with only the selected, accepted sections taken from the candidate. */
export function mergeRewrite(before: string, after: string, selected: number[]): string {
  const report = compareRewrite(before, after);
  const a = splitSections(before);
  const b = splitSections(after);
  for (const index of selected) {
    const section = report.sections[index - 1];
    if (!section) throw new UsageError(`--sections: there is no section ${index}`);
    if (section.status !== 'accepted') throw new UsageError(`--sections: section ${index} is ${section.status}${section.reasons.length ? ` (${section.reasons.join('; ')})` : ''}`);
  }
  return a.map((s, i) => (selected.includes(i + 1) ? b[i]!.text : s.text)).join('');
}

function candidatePath(path: string): string {
  const full = resolve(path);
  if (!full.split(sep).includes(CANDIDATE_DIR)) throw new UsageError(`${path}: a candidate must be under ${CANDIDATE_DIR}/`);
  if (!existsSync(full) || !statSync(full).isFile()) throw new UsageError(`${path} is not a file`);
  return full;
}

function removeCandidate(full: string): void {
  rmSync(full);
  // Remove the emptied folders, up to and including the candidate folder.
  for (let dir = dirname(full); dir.split(sep).includes(CANDIDATE_DIR); dir = dirname(dir)) {
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
  return compareRewrite(readFileSync(file, 'utf8'), readFileSync(candidatePath(candidate), 'utf8'));
}

export function parseSections(raw: string | undefined): number[] {
  if (raw === undefined || !/^\d+(,\d+)*$/.test(raw)) throw new UsageError('--sections: give section numbers, e.g. 2,5');
  return [...new Set(raw.split(',').map(Number))];
}

/** Applies the selected sections and removes the candidate. Without Git, keeps the original beside the file. */
export function rewriteApply(file: string, candidate: string, selected: number[]): { savedBytes: number; backup: string | null } {
  rewriteCheck(file, candidate);
  const full = candidatePath(candidate);
  const before = readFileSync(file, 'utf8');
  const merged = mergeRewrite(before, readFileSync(full, 'utf8'), selected);
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
  removeCandidate(candidatePath(candidate));
}
