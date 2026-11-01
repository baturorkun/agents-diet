---
id: RQ-0001
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-11-01T19:02:03.691Z"
branch: "factory/RQ-0001"
createdFromCommit: "56a6fdf95d072865f4d039da79b5250c2ca9e202"
completedRunId: "20261101190650-RQ-0001"
completedBy: "human"
completedAt: "2026-11-01T20:27:57.967Z"
githubPullRequestUrl: "https://github.com/baturorkun/agents-diet/pull/2"
githubPullRequestIid: 2
githubIssueUrl: "https://github.com/baturorkun/agents-diet/issues/1"
githubIssueIid: 1
repositoryProvider: github
---
# RQ-0001 - agents-diet check: find AGENTS.md and CLAUDE.md files, report their size, a missing CLAUDE.md import and dead path references, with a byte limit for CI

The package's first command. Agent instruction files (`AGENTS.md`,
`CLAUDE.md`) are loaded into every session in full and grow until they cost
more than they give, or stop being read: Codex cuts a project's instruction
files at 32 KiB by default (`project_doc_max_bytes`), and Claude Code reads
`CLAUDE.md`, not `AGENTS.md`, so a project with only `AGENTS.md` gives Claude
Code no rules at all. `agents-diet check` finds these files and reports what
can be measured, for a person, for a script (`--json`) and as a CI gate.

The template's example (`greet`, the greeting CLI and its tests) goes.

## The command

`agents-diet check [dir]` (default: the working directory).

- **Finding the files.** Every `AGENTS.md` and `CLAUDE.md` under `dir`, and
  `.claude/CLAUDE.md`. In a Git checkout, among the files Git tracks or would
  track (`git ls-files --cached --others --exclude-standard`), so `.gitignore`
  keeps generated copies out; elsewhere, every file. Never under
  `node_modules/`, `.git/`, `dist/`, `build/`, `coverage/` or `.pnpm-store/`.
  Listed by path relative to `dir`, sorted.
- **Ignore.** `package.json` `"agents-diet": { "ignore": [paths] }`, else
  `.agents-diet.json` `ignore`: path prefixes left out (copies of instruction
  files a project keeps under version control). Files under them are not
  checked and references into them are not reported. Not a list of non-empty
  strings: a usage error.
- **Size.** For each file: bytes (UTF-8), characters, and an estimate of
  tokens (characters / 4, rounded up, marked as an estimate).
- **The limit.** A file over the limit in bytes is a finding. The limit, the
  first of: `--max-bytes <n>`; `package.json` field `"agents-diet": {
  "maxBytes": n }` in `dir`; `.agents-diet.json` (`{ "maxBytes": n }`) in
  `dir`; else 32768 (Codex's default). The report says which one it used. A
  limit that is not a positive integer is a usage error.
- **Claude Code and AGENTS.md.** For every directory with an `AGENTS.md`:
  no `CLAUDE.md` beside it (for `dir` itself, `.claude/CLAUDE.md` counts) is a
  finding ("Claude Code does not read AGENTS.md"); a `CLAUDE.md` with no
  `@AGENTS.md` (or `@./AGENTS.md`) import line is a finding.
- **Dead references.** In each file, a path that does not exist, from:
  markdown links `[text](path)` and inline code spans that look like a path:
  no spaces, none of `@ : = < > ( ) , ' " | ! ? ;`, and either a `/` or a
  name ending in a known file extension (`md`, `json`, `yaml`, `ts`, `js`,
  `py`, `sh`, … — `config.value` is code, not a file); a bare extension
  (`.bit`) is not a path. A path is resolved against the file's directory and
  against `dir`; it exists if either does. A file named without a directory
  exists if a file of that name is anywhere in the project. In a Git checkout
  a path Git ignores (build output) is not reported. Not checked: URLs,
  `#anchors`, `mailto:`, absolute paths, `~/` paths, anything with `*`, `<`,
  `{` or `$`, and paths under `node_modules/`. A `#anchor` or `:line` suffix
  is dropped before checking. `@path` imports in `CLAUDE.md` are checked the
  same way.

## Output and exit

- A human report: one block per file with its size and its findings, then a
  summary line (files, total bytes, findings, the limit and where it came
  from).
- `--json`: one JSON document on stdout, the same content:
  `{ "root", "limit": { "bytes", "source" }, "ignore": [paths], "files": [ { "path", "bytes",
  "chars", "tokens", "findings": [ { "kind", "message", "ref"? } ] } ],
  "summary": { "files", "bytes", "findings" } }`. Finding kinds:
  `over-limit`, `missing-claude-md`, `no-agents-import`, `dead-reference`.
- Exit 0 with no finding, 1 with any, 2 on a usage error (unknown command or
  option, a bad limit, `dir` not a directory). `--help` and `--version` as
  the template's CLI. `agents-diet` with no command prints the help, exit 0.
- No file is written or changed: `check` only reads.

## The library

`import { check } from "agents-diet"`: `check(dir, { maxBytes? })` returns
the report object the `--json` output prints. No runtime dependency.

## Out of scope

Blocks repeated across projects, the skill and `install`, suggestions of
where a section belongs, reading aifactory's `maxContextChars`.

## Acceptance Criteria

- `agents-diet check` on a fixture project reports each finding kind once,
  with the path and line-independent message; on a clean fixture it reports
  no finding and exits 0.
- The limit comes from the flag, then `package.json`, then
  `.agents-diet.json`, then 32768, and the report names the source; a test
  shows each.
- Directories with `AGENTS.md` and no `CLAUDE.md`, or a `CLAUDE.md` without
  the import, are reported; `.claude/CLAUDE.md` with the import satisfies the
  root.
- Dead references: a missing linked file and a missing code-span path are
  reported; an existing one (relative to the file or to `dir`), a URL, an
  anchor, a glob, an absolute path and a `node_modules/` path are not.
- Code names, versions, hosts and bare extensions are not taken for paths; a
  bare file name found elsewhere in the project is not reported; in a Git
  checkout ignored files are not checked and ignored paths are not dead;
  `ignore` from either settings file leaves paths out.
- `--json` prints the documented shape; exit codes 0, 1 and 2 as above; the
  files `check` read are unchanged.
- The template example is gone; `pnpm typecheck`, `pnpm test`, `pnpm build`
  and `pnpm pack:check` pass.
- Test fixtures are neutral: no customer, company project or internal path.
