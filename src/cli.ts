#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { check, UsageError, type Report } from './check.js';
import { init, type InitTarget } from './init.js';

const HELP = `Usage: agents-diet <command> [options]

Commands:
  check [dir]          Find AGENTS.md and CLAUDE.md files under dir (default: .)
                       and report their size, a missing CLAUDE.md or its
                       @AGENTS.md import, and paths they name that do not exist.
  init [dir]           Put the agents-diet skill into the project, so its agent
                       knows how to shrink the files: .claude/skills/agents-diet/
                       (and .codex/skills/agents-diet/ when .codex/ exists).

Options for check:
  --max-bytes <n>      The size limit per file (else package.json
                       "agents-diet".maxBytes, .agents-diet.json, or 32768)
  --json               Print the report as JSON

Options for init:
  --claude, --codex    Install for that agent only (default: Claude Code, and
                       Codex when the project has a .codex/ directory)
  --force              Replace a copy of the skill someone changed

Settings (package.json "agents-diet", else .agents-diet.json):
  maxBytes             the size limit per file
  ignore               paths left out, e.g. ["runs/"]

Options:
  -h, --help           show this help
  -v, --version        print the version

Exit: 0 no finding, 1 findings, 2 a usage error.`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pkg.version;
}

function human(report: Report): string {
  const lines: string[] = [];
  for (const file of report.files) {
    lines.push(`${file.path}  ${file.bytes.toLocaleString('en-US')} bytes  ~${file.tokens.toLocaleString('en-US')} tokens`);
    if (file.findings.length === 0) lines.push('  ✓ no finding');
    for (const finding of file.findings) lines.push(`  ✗ ${finding.message}`);
    // The sections worth moving: over 1 KiB, largest first.
    const large = file.sections.filter((section) => section.bytes > 1024).sort((a, b) => b.bytes - a.bytes);
    for (const section of large) {
      const marks = [section.numberedSteps > 0 ? `${section.numberedSteps} numbered steps` : '', section.codeBlocks > 0 ? `${section.codeBlocks} code blocks` : ''].filter(Boolean).join(', ');
      lines.push(`  · ${section.heading === null ? '(before the first heading)' : `${'#'.repeat(section.level)} ${section.heading}`}  ${section.bytes.toLocaleString('en-US')} bytes${marks ? `  (${marks})` : ''}`);
    }
  }
  if (report.files.length === 0) lines.push('No AGENTS.md or CLAUDE.md found.');
  const { files, bytes, findings } = report.summary;
  lines.push('', `${files} file(s), ${bytes.toLocaleString('en-US')} bytes, ${findings} finding(s); limit ${report.limit.bytes} bytes (${report.limit.source})`);
  return lines.join('\n');
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
        claude: { type: 'boolean' },
        codex: { type: 'boolean' },
        force: { type: 'boolean' },
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
      const targets = (['claude', 'codex'] as InitTarget[]).filter((target) => values[target]);
      const results = init(dir, { targets, force: values.force });
      for (const result of results) {
        const said = result.outcome === 'written' ? 'wrote' : result.outcome === 'current' ? 'already current' : 'kept (changed here; --force replaces it)';
        console.log(`${said}  ${result.path}`);
      }
      return 0;
    }
    for (const option of ['claude', 'codex', 'force'] as const) {
      if (values[option]) throw new UsageError(`--${option} applies to init, not check`);
    }
    const raw = values['max-bytes'];
    const maxBytes = raw === undefined ? undefined : /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (maxBytes !== undefined && Number.isNaN(maxBytes)) throw new UsageError(`--max-bytes: the limit must be a positive integer, not "${raw}"`);
    const report = check(dir, { maxBytes });
    console.log(values.json ? JSON.stringify(report, null, 2) : human(report));
    return report.summary.findings === 0 ? 0 : 1;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
