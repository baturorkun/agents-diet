#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { check, UsageError, type Report } from './check.js';
import { init, type InitTarget } from './init.js';
import { parseSections, rewriteApply, rewriteCheck, rewriteDiscard, type RewriteReport } from './rewrite.js';

const HELP = `Usage: agents-diet <command> [options]

Commands:
  check [dir]          Find AGENTS.md and CLAUDE.md files under dir (default: .)
                       and report their size, a missing CLAUDE.md or its
                       @AGENTS.md import, and paths they name that do not exist.
  init [dir]           Put the agents-diet skill into the project, so its agent
                       knows how to shrink the files: .agents/skills/agents-diet/
                       (Codex, Gemini CLI, Antigravity, Cursor, GitHub Copilot)
                       and .claude/skills/agents-diet/ (Claude Code).
  rewrite check <file> <candidate>
                       Compare a rewrite candidate with the file, section by
                       section, against the rewrite limits. Changes nothing.
  rewrite apply <file> <candidate> --sections 2,5
                       Apply only those accepted sections, remove the candidate.
  rewrite discard <candidate>
                       Remove a candidate under .agents-diet-rewrite/.

Options for check:
  --max-bytes <n>      The size limit per file (else package.json
                       "agents-diet".maxBytes, .agents-diet.json, or 32768)
  --json               Print the report as JSON

Options for init:
  --agents, --claude   Install in that location only (default: both)
  --codex              Same as --agents: Codex reads .agents/skills/
  --force              Replace a copy of the skill someone changed

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
    const name = s.heading ?? '(before the first heading)';
    const head = `${s.status === 'accepted' ? '✓' : '✗'} ${s.index}. ${name}  ${s.beforeBytes} → ${s.afterBytes} bytes`;
    return [head, ...s.reasons.map((r) => `    ${r}`), ...s.missing.slice(0, 8).map((m) => `    missing: ${m}`)].join('\n');
  });
  if (lines.length === 0) lines.push('The candidate changes nothing.');
  lines.push('', `${report.sections.filter((s) => s.status === 'accepted').length} section(s) accepted, ${report.acceptedBytes} bytes saved if all are applied`);
  return lines.join('\n');
}

function runRewrite(args: string[], json: boolean | undefined, sections: string | undefined): number {
  const [action, first, second, ...rest] = args;
  if (rest.length > 0) throw new UsageError(`Unexpected argument: ${rest[0]}`);
  if (action === 'discard' && first && !second) {
    rewriteDiscard(first);
    console.log(`discarded  ${first}`);
    return 0;
  }
  if ((action !== 'check' && action !== 'apply') || !first || !second) throw new UsageError('Usage: agents-diet rewrite check|apply <file> <candidate>, or rewrite discard <candidate>');
  if (action === 'check') {
    const report = rewriteCheck(first, second);
    console.log(json ? JSON.stringify(report, null, 2) : rewriteHuman(report));
    return report.structureOk && report.sections.every((s) => s.status !== 'rejected') ? 0 : 1;
  }
  const done = rewriteApply(first, second, parseSections(sections));
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
        sections: { type: 'string' },
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
      for (const option of ['max-bytes', 'agents', 'claude', 'codex', 'force'] as const) {
        if (values[option] !== undefined) throw new UsageError(`--${option} does not apply to rewrite`);
      }
      return runRewrite(positionals.slice(1), values.json, values.sections);
    } catch (error) {
      if (error instanceof UsageError) {
        console.error(error.message);
        return 2;
      }
      throw error;
    }
  }
  if (values.sections !== undefined) {
    console.error('--sections applies to rewrite apply');
    return 2;
  }
  if ((command !== 'check' && command !== 'init') || rest.length > 0) {
    console.error(command !== 'check' && command !== 'init' ? `Unknown command: ${command}` : `Unexpected argument: ${rest[0]}`);
    console.error(HELP);
    return 2;
  }
  try {
    if (command === 'init') {
      for (const [option, forCommand] of [['json', 'check'], ['max-bytes', 'check']] as const) {
        if (values[option] !== undefined) throw new UsageError(`--${option} applies to ${forCommand}, not init`);
      }
      // --codex is kept from 0.1.0, where it installed into .codex/skills/; Codex reads .agents/skills/.
      const targets: InitTarget[] = [...(values.agents || values.codex ? ['agents' as const] : []), ...(values.claude ? ['claude' as const] : [])];
      const results = init(dir, { targets, force: values.force });
      for (const result of results) {
        const said = result.outcome === 'written' ? 'wrote' : result.outcome === 'current' ? 'already current' : 'kept (changed here; --force replaces it)';
        console.log(`${said}  ${result.path}`);
      }
      return 0;
    }
    for (const option of ['agents', 'claude', 'codex', 'force'] as const) {
      if (values[option]) throw new UsageError(`--${option} applies to init, not check`);
    }
    const raw = values['max-bytes'];
    const maxBytes = raw === undefined ? undefined : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (maxBytes !== undefined && Number.isNaN(maxBytes)) throw new UsageError(`--max-bytes: the limit must be a positive integer, not "${raw}"`);
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
