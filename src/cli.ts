#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { check, UsageError, type Report } from './check.js';
import { init, type InitTarget } from './init.js';
import { detectNotifyTools, formatNotice, installNotify, notifyMessage, NOTIFY_TOOLS, parseTools, removeNotify, type NotifyFormat } from './notify.js';
import { rewriteApply, rewriteCheck, rewriteDiscard, rewritePreview, type RewritePreview, type RewriteReport } from './rewrite.js';

const HELP = `Usage: agents-diet <command> [options]

Commands:
  check [dir]          Find AGENTS.md and CLAUDE.md files under dir (default: .)
                       and report their size, a missing CLAUDE.md or its
                       @AGENTS.md import, and paths they name that do not exist.
  init [dir]           Put the agents-diet skill into the project, so its agent
                       knows how to shrink the files: .agents/skills/agents-diet/
                       (Codex, Gemini CLI, Antigravity, Cursor, GitHub Copilot)
                       and .claude/skills/agents-diet/ (Claude Code). Adds a
                       session-start hook for the tools the project uses: at
                       the size limit it suggests shrinking, never starts it.
  rewrite preview <file> <new-file>
                       Compare CLAUDE.md with its CLAUDE.rewrite.md, by section
                       heading, with the changed lines. Changes nothing.
  rewrite check <file> <new-file>
                       Compare the new file with the rewrite limits.
  rewrite apply <file> <new-file> [--exclude "<heading>"]...
                       Apply the accepted sections, except the named ones, and
                       remove the new file.
  rewrite discard <new-file>
                       Remove a <name>.rewrite.md.

Options for check:
  --max-bytes <n>      The size limit per file (else package.json
                       "agents-diet".maxBytes, .agents-diet.json, or 32768)
  --json               Print the report as JSON
  --notify             Only suggest shrinking when a file reached the limit:
                       silent under it, always exits 0, changes nothing
  --format <tool>      Output for --notify: text (default), claude, codex,
                       gemini, antigravity, cursor, copilot

Options for init:
  --agents, --claude   Install in that location only (default: both)
  --codex              Same as --agents: Codex reads .agents/skills/
  --force              Replace a copy of the skill someone changed
  --notify-for <tools> Add the size-limit hook for these tools instead of the
                       ones detected, e.g. claude,cursor or all
  --no-notify          Do not add the size-limit hook
  --remove-notify <tools>
                       Remove that hook; installs nothing

Settings (package.json "agents-diet", else .agents-diet.json):
  maxBytes             the size limit per file
  ignore               paths left out, e.g. ["runs/"]

Options:
  -h, --help           show this help
  -v, --version        print the version

Exit: 0 no error (warnings allowed), 1 errors, 2 a usage error.`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
}

function human(report: Report): string {
  const lines: string[] = [];
  for (const file of report.files) {
    lines.push(`${file.path}  ${file.bytes.toLocaleString('en-US')} bytes  ~${file.tokens.toLocaleString('en-US')} tokens`);
    if (file.findings.length === 0) lines.push('  ✓ no finding');
    for (const finding of file.findings) lines.push(`  ${finding.severity === 'warning' ? '⚠' : '✗'} ${finding.message}`);
    // The sections worth moving: over 1 KiB, largest first.
    const large = file.sections.filter((section) => section.bytes > 1024).sort((a, b) => b.bytes - a.bytes);
    for (const section of large) {
      const marks = [section.numberedSteps > 0 ? `${section.numberedSteps} numbered steps` : '', section.codeBlocks > 0 ? `${section.codeBlocks} code blocks` : ''].filter(Boolean).join(', ');
      lines.push(`  · ${section.heading === null ? '(before the first heading)' : `${'#'.repeat(section.level)} ${section.heading}`}  ${section.bytes.toLocaleString('en-US')} bytes${marks ? `  (${marks})` : ''}`);
    }
  }
  if (report.files.length === 0) lines.push('No AGENTS.md or CLAUDE.md found.');
  const { files, bytes, findings, warnings } = report.summary;
  lines.push('', `${files} file(s), ${bytes.toLocaleString('en-US')} bytes, ${findings} finding(s)${warnings > 0 ? ` (${warnings} warning(s))` : ''}; limit ${report.limit.bytes} bytes (${report.limit.source})`);
  return lines.join('\n');
}

function rewriteHuman(report: RewriteReport): string {
  const lines = report.sections.filter((s) => s.status !== 'unchanged').map((s) => {
    const name = s.heading?.replace(/^#+\s*/, '') ?? '(before the first heading)';
    const head = `${s.status === 'accepted' ? '✓' : '✗'} ${name}  ${s.beforeBytes} → ${s.afterBytes} bytes`;
    return [head, ...s.reasons.map((r) => `    ${r}`), ...s.missing.slice(0, 8).map((m) => `    missing: ${m}`)].join('\n');
  });
  if (lines.length === 0) lines.push('The candidate changes nothing.');
  lines.push('', `${report.sections.filter((s) => s.status === 'accepted').length} section(s) accepted, ${report.acceptedBytes} bytes saved if all are applied`);
  return lines.join('\n');
}

function previewHuman(file: string, candidate: string, p: RewritePreview): string {
  if (p.identical) return `${candidate} is identical to ${file}: no rewrite was written.`;
  const size = (n: number): string => n.toLocaleString('en-US');
  const percent = p.beforeBytes === 0 ? 0 : Math.round((100 * (p.beforeBytes - p.afterBytes)) / p.beforeBytes);
  const lines = [`Original: ${file}`, `New file: ${candidate}`, `Compare:  git diff --no-index -- ${file} ${candidate}`, '', p.canApply ? `${size(p.beforeBytes)} → ${size(p.afterBytes)} bytes (${percent}% smaller)` : `No safe shortening found: ${size(p.beforeBytes)} bytes stay as they are`];
  if (p.shortened.length > 0) {
    lines.push('', 'To shorten');
    for (const s of p.shortened) lines.push(`  ${s.heading}  ${size(s.beforeBytes)} → ${size(s.afterBytes)} bytes  ${s.changedLines} line(s) changed`);
  }
  if (p.kept.length > 0) {
    lines.push('', 'Left as they are');
    for (const s of p.kept) {
      lines.push(`  ${s.heading}  ${s.why}`);
      for (const m of s.missing.slice(0, 5)) lines.push(`    would lose: ${m}`);
    }
  }
  if (p.shortened.length > 0) {
    lines.push('', 'Changed lines');
    for (const s of p.shortened) {
      lines.push(`  ${s.heading}`);
      for (const c of s.changes) lines.push(`  ${c.type === 'removed' ? '-' : '+'} ${c.text}`);
    }
  }
  return lines.join('\n');
}

function runRewrite(args: string[], json: boolean | undefined, exclude: string[]): number {
  const [action, first, second, ...rest] = args;
  if (rest.length > 0) throw new UsageError(`Unexpected argument: ${rest[0]}`);
  if (action !== 'apply' && exclude.length > 0) throw new UsageError('--exclude applies to rewrite apply');
  if (action === 'discard' && first && !second) {
    rewriteDiscard(first);
    console.log(`discarded  ${first}`);
    return 0;
  }
  if ((action !== 'check' && action !== 'preview' && action !== 'apply') || !first || !second) throw new UsageError('Usage: agents-diet rewrite preview|check|apply <file> <new-file>, or rewrite discard <new-file>');
  if (action === 'preview') {
    const preview = rewritePreview(first, second);
    console.log(json ? JSON.stringify(preview, null, 2) : previewHuman(first, second, preview));
    return preview.canApply ? 0 : 1;
  }
  if (action === 'check') {
    const report = rewriteCheck(first, second);
    console.log(json ? JSON.stringify(report, null, 2) : rewriteHuman(report));
    return report.structureOk && report.sections.every((s) => s.status !== 'rejected') ? 0 : 1;
  }
  const done = rewriteApply(first, second, exclude);
  console.log(`applied  ${first}  ${done.savedBytes} bytes saved${done.backup ? `; original kept at ${done.backup}` : ''}`);
  return 0;
}

function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        json: { type: 'boolean' },
        'max-bytes': { type: 'string' },
        agents: { type: 'boolean' },
        claude: { type: 'boolean' },
        codex: { type: 'boolean' },
        force: { type: 'boolean' },
        exclude: { type: 'string', multiple: true },
        notify: { type: 'boolean' },
        format: { type: 'string' },
        'notify-for': { type: 'string' },
        'no-notify': { type: 'boolean' },
        'remove-notify': { type: 'string' },
      },
    });
  } catch (error) {
    console.error((error as Error).message);
    console.error(HELP);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(version());
    return 0;
  }
  const [command, dir = '.', ...rest] = positionals;
  if (command === undefined) {
    console.log(HELP);
    return 0;
  }
  if (command === 'rewrite') {
    try {
      for (const option of ['max-bytes', 'agents', 'claude', 'codex', 'force', 'notify', 'format', 'notify-for', 'no-notify', 'remove-notify'] as const) {
        if (values[option] !== undefined) throw new UsageError(`--${option} does not apply to rewrite`);
      }
      return runRewrite(positionals.slice(1), values.json, values.exclude ?? []);
    } catch (error) {
      if (error instanceof UsageError) {
        console.error(error.message);
        return 2;
      }
      throw error;
    }
  }
  if (values.exclude !== undefined) {
    console.error('--exclude applies to rewrite apply');
    return 2;
  }
  if ((command !== 'check' && command !== 'init') || rest.length > 0) {
    console.error(command !== 'check' && command !== 'init' ? `Unknown command: ${command}` : `Unexpected argument: ${rest[0]}`);
    console.error(HELP);
    return 2;
  }
  try {
    if (command === 'init') {
      for (const [option, forCommand] of [['json', 'check'], ['max-bytes', 'check'], ['notify', 'check'], ['format', 'check']] as const) {
        if (values[option] !== undefined) throw new UsageError(`--${option} applies to ${forCommand}, not init`);
      }
      if (values['remove-notify'] !== undefined) {
        if (values['notify-for'] !== undefined || values['no-notify']) throw new UsageError('--remove-notify cannot be used with --notify-for or --no-notify');
        for (const result of removeNotify(dir, parseTools(values['remove-notify']))) console.log(`${result.outcome === 'removed' ? 'removed hook' : 'no hook'}  ${result.path}`);
        return 0;
      }
      // Parsed and validated before the skill is written, so a bad option changes nothing.
      if (values['notify-for'] !== undefined && values['no-notify']) throw new UsageError('--notify-for and --no-notify cannot be used together');
      const namedTools = values['notify-for'] === undefined ? null : parseTools(values['notify-for']);
      // --codex is kept from 0.1.0, where it installed into .codex/skills/; Codex reads .agents/skills/.
      const targets: InitTarget[] = [...(values.agents || values.codex ? ['agents' as const] : []), ...(values.claude ? ['claude' as const] : [])];
      // Detected before the skill is written: init itself creates .claude and .agents.
      const notifyTools = values['no-notify'] ? [] : (namedTools ?? detectNotifyTools(dir, targets));
      const results = init(dir, { targets, force: values.force });
      for (const result of results) {
        const said = result.outcome === 'written' ? 'wrote' : result.outcome === 'current' ? 'already current' : 'kept (changed here; --force replaces it)';
        console.log(`${said}  ${result.path}`);
      }
      // A named tool with a bad config is an error; a detected one is reported and the install stands.
      for (const result of installNotify(dir, notifyTools, { skipInvalid: namedTools === null })) {
        const said = result.outcome === 'added' ? 'added hook' : result.outcome === 'skipped' ? `hook not added (${result.reason})` : 'hook already there';
        console.log(`${said}  ${result.path}`);
      }
      return 0;
    }
    for (const option of ['agents', 'claude', 'codex', 'force', 'notify-for', 'no-notify', 'remove-notify'] as const) {
      if (values[option]) throw new UsageError(`--${option} applies to init, not check`);
    }
    const format = (values.format ?? 'text') as NotifyFormat;
    if (values.format !== undefined && !values.notify) throw new UsageError('--format applies to --notify');
    if (!['text', ...NOTIFY_TOOLS].includes(format)) throw new UsageError(`--format: unknown format ${format}`);
    if (values.notify && values.json) throw new UsageError('--notify and --json cannot be used together');
    const raw = values['max-bytes'];
    const maxBytes = raw === undefined ? undefined : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (maxBytes !== undefined && Number.isNaN(maxBytes)) throw new UsageError(`--max-bytes: the limit must be a positive integer, not "${raw}"`);
    if (values.notify) {
      // Runs at session start: a broken project or setting must never block it.
      try {
        const message = notifyMessage(check(dir, { maxBytes }));
        if (message) console.log(formatNotice(format, message));
      } catch {
        /* say nothing */
      }
      return 0;
    }
    const report = check(dir, { maxBytes });
    console.log(values.json ? JSON.stringify(report, null, 2) : human(report));
    return report.summary.errors === 0 ? 0 : 1;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
