import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { UsageError, type Report } from './check.js';
import type { InitTarget } from './init.js';

/** The tools whose session-start hook is documented (RQ-L09). */
export const NOTIFY_TOOLS = ['claude', 'codex', 'gemini', 'antigravity', 'cursor', 'copilot'] as const;
export type NotifyTool = (typeof NOTIFY_TOOLS)[number];
export type NotifyFormat = NotifyTool | 'text';

/** Where each tool reads project hooks. */
export const NOTIFY_PATHS: Record<NotifyTool, string> = {
  claude: '.claude/settings.json',
  codex: '.codex/hooks.json',
  gemini: '.gemini/settings.json',
  antigravity: '.agents/hooks.json',
  cursor: '.cursor/hooks.json',
  copilot: '.github/hooks/agents-diet.json',
};

const MARKER = 'agents-diet check --notify';
const ANTIGRAVITY_HOOK = 'agents-diet-notify';

/** The suggestion, or null under the limit. It only suggests: the agent is told not to start. */
export function notifyMessage(report: Report): string | null {
  const over = report.files.flatMap((file) => file.findings.filter((f) => f.kind === 'over-limit' || f.kind === 'over-limit-combined').map((f) => ({ file, combined: f.kind === 'over-limit-combined' })));
  if (over.length === 0) return null;
  const named = over.slice(0, 3).map(({ file, combined }) => `${file.path} (${file.bytes.toLocaleString('en-US')} bytes${combined ? ', over the limit together with the AGENTS.md files above it' : ''})`).join(', ');
  const more = over.length > 3 ? ` and ${over.length - 3} more` : '';
  return `agents-diet: ${named}${more} reached the size limit of ${report.limit.bytes.toLocaleString('en-US')} bytes. Tell the user once and suggest asking you to put the file on a diet. Do not start shrinking unless the user asks.`;
}

/** The message in the output each tool's session-start hook documents. */
export function formatNotice(format: NotifyFormat, message: string): string {
  switch (format) {
    case 'text':
    case 'claude':
    case 'codex':
      return message; // plain stdout is added as context
    case 'gemini':
      return JSON.stringify({ systemMessage: message, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } });
    case 'antigravity':
      return JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: message } }] });
    case 'cursor':
      return JSON.stringify({ additional_context: message });
    case 'copilot':
      return JSON.stringify({ additionalContext: message });
  }
}

/** Never fails and never needs the network: without an installed agents-diet it does nothing. */
export function hookCommand(tool: NotifyTool): string {
  const run = `check --notify --format ${tool} 2>/dev/null`;
  return `cd "\${CLAUDE_PROJECT_DIR:-\${GEMINI_PROJECT_DIR:-.}}" 2>/dev/null; if command -v agents-diet >/dev/null 2>&1; then agents-diet ${run}; elif [ -x node_modules/.bin/agents-diet ]; then node_modules/.bin/agents-diet ${run}; fi; exit 0`;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const ours = (value: unknown): boolean => (JSON.stringify(value) ?? '').includes(MARKER);

function readConfig(path: string, shown: string): Json {
  if (!existsSync(path)) return {};
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new UsageError(`${shown} is not valid JSON; left unchanged`);
  }
  if (!isObject(value)) throw new UsageError(`${shown} is not a JSON object; left unchanged`);
  return value;
}

/** The event's list inside `hooks`, created when asked. */
function eventList(config: Json, event: string, shown: string, create: boolean): unknown[] | null {
  if (config.hooks === undefined && !create) return null;
  if (config.hooks === undefined) config.hooks = {};
  if (!isObject(config.hooks)) throw new UsageError(`${shown}: "hooks" is not an object; left unchanged`);
  const hooks = config.hooks;
  if (hooks[event] === undefined && !create) return null;
  if (hooks[event] === undefined) hooks[event] = [];
  if (!Array.isArray(hooks[event])) throw new UsageError(`${shown}: "hooks.${event}" is not a list; left unchanged`);
  return hooks[event] as unknown[];
}

function addHook(tool: NotifyTool, config: Json, shown: string): boolean {
  const command = hookCommand(tool);
  if (tool === 'antigravity') {
    if (ours(config[ANTIGRAVITY_HOOK])) return false;
    if (config[ANTIGRAVITY_HOOK] !== undefined) throw new UsageError(`${shown}: "${ANTIGRAVITY_HOOK}" already exists; left unchanged`);
    config[ANTIGRAVITY_HOOK] = { SessionStart: [{ type: 'command', command }] };
    return true;
  }
  const event = tool === 'cursor' || tool === 'copilot' ? 'sessionStart' : 'SessionStart';
  const list = eventList(config, event, shown, true)!;
  if (list.some(ours)) return false;
  if (tool === 'cursor' || tool === 'copilot') config.version ??= 1;
  if (tool === 'cursor') list.push({ command });
  else if (tool === 'copilot') list.push({ type: 'command', bash: command, timeoutSec: 10 });
  else list.push({ matcher: 'startup', hooks: [{ type: 'command', command }] });
  return true;
}

function dropHook(tool: NotifyTool, config: Json, shown: string): boolean {
  if (tool === 'antigravity') {
    if (!ours(config[ANTIGRAVITY_HOOK])) return false;
    delete config[ANTIGRAVITY_HOOK];
    return true;
  }
  const event = tool === 'cursor' || tool === 'copilot' ? 'sessionStart' : 'SessionStart';
  const list = eventList(config, event, shown, false);
  if (!list?.some(ours)) return false;
  const hooks = config.hooks as Json;
  const kept = list.flatMap((entry) => {
    if (!ours(entry)) return [entry];
    // A group may hold someone else's hook beside ours: keep the group without ours.
    if (isObject(entry) && Array.isArray(entry.hooks)) {
      const others = entry.hooks.filter((hook) => !ours(hook));
      return others.length > 0 ? [{ ...entry, hooks: others }] : [];
    }
    return [];
  });
  if (kept.length > 0) hooks[event] = kept;
  else delete hooks[event];
  if (Object.keys(hooks).length === 0) delete config.hooks;
  return true;
}

export function parseTools(raw: string): NotifyTool[] {
  const names = raw === 'all' ? [...NOTIFY_TOOLS] : raw.split(',').map((name) => name.trim());
  for (const name of names) if (!(NOTIFY_TOOLS as readonly string[]).includes(name)) throw new UsageError(`Unknown tool: ${name} (use ${NOTIFY_TOOLS.join(', ')} or all)`);
  return [...new Set(names)] as NotifyTool[];
}

function checked(dir: string): string {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`${dir} is not a directory`);
  return root;
}

const SIGNS: Record<NotifyTool, string[]> = {
  claude: ['.claude'],
  codex: ['.codex'],
  gemini: ['.gemini', 'GEMINI.md'],
  antigravity: ['.agents/hooks.json', '.agents/rules', '.agent'],
  cursor: ['.cursor'],
  copilot: ['.github/hooks', '.github/copilot-instructions.md'],
};

/**
 * The tools a plain `init` adds the hook for. Call it before init creates anything. Without a sign
 * of any tool: Claude Code, whose skill location init creates anyway, unless the install excludes it.
 */
export function detectNotifyTools(dir: string, targets: InitTarget[] = []): NotifyTool[] {
  const root = checked(dir);
  if (targets.length === 1 && targets[0] === 'claude') return ['claude'];
  const found = NOTIFY_TOOLS.filter((tool) => SIGNS[tool].some((sign) => existsSync(join(root, sign))));
  if (targets.length === 1 && targets[0] === 'agents') return found.filter((tool) => tool !== 'claude');
  return found.length > 0 ? [...found] : ['claude'];
}

export interface NotifyResult { tool: NotifyTool; path: string; outcome: 'added' | 'current' | 'removed' | 'absent' | 'skipped'; reason?: string; }

/** Adds the hook to each tool's project config, keeping what is there. Validates every file first. */
export function installNotify(dir: string, tools: NotifyTool[], { skipInvalid = false } = {}): NotifyResult[] {
  const root = checked(dir);
  const plans = tools.map((tool) => {
    const path = join(root, NOTIFY_PATHS[tool]);
    try {
      const config = readConfig(path, NOTIFY_PATHS[tool]);
      return { tool, path, config, changed: addHook(tool, config, NOTIFY_PATHS[tool]) };
    } catch (error) {
      if (!skipInvalid || !(error instanceof UsageError)) throw error;
      return { tool, path, config: {}, changed: false, reason: error.message };
    }
  });
  return plans.map(({ tool, path, config, changed, reason }): NotifyResult => {
    if (reason) return { tool, path: NOTIFY_PATHS[tool], outcome: 'skipped', reason };
    if (changed) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    }
    return { tool, path: NOTIFY_PATHS[tool], outcome: changed ? 'added' : 'current' };
  });
}

/** Removes only our hook. A config file left with nothing in it is removed. */
export function removeNotify(dir: string, tools: NotifyTool[]): NotifyResult[] {
  const root = checked(dir);
  const plans = tools.map((tool) => {
    const path = join(root, NOTIFY_PATHS[tool]);
    const config = readConfig(path, NOTIFY_PATHS[tool]);
    return { tool, path, config, changed: existsSync(path) && dropHook(tool, config, NOTIFY_PATHS[tool]) };
  });
  return plans.map(({ tool, path, config, changed }) => {
    if (changed) {
      const left = Object.keys(config).filter((key) => !(key === 'version' && (tool === 'cursor' || tool === 'copilot')));
      if (left.length === 0) rmSync(path);
      else writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    }
    return { tool, path: NOTIFY_PATHS[tool], outcome: changed ? 'removed' : 'absent' };
  });
}
