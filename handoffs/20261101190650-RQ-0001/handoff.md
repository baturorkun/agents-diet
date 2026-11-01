# Manual Handoff

Run ID: `20261101190650-RQ-0001`

Use this handoff in the manual implementation flow when you want an external implementer to complete the requirement without running the AI Factory agent pipeline.

## Instruction for Implementer

Read the requirement and constraints below, inspect the target project, implement the change directly in the workspace, and run the configured local checks. Do not call the AI Factory LLM pipeline for this task.

## Target Project

- Root: /Users/batur/Documents/Projects/bytecraft/agentic/agents-diet
- Profile: npm-package
- Usual paths: src, tests, package.json, README.md, tsconfig.json, tsconfig.build.json (where the requirement work normally belongs; a handoff capture is not restricted to them)
- Build: pnpm build && pnpm pack:check
- Typecheck: pnpm typecheck
- Lint: (not configured)
- Test: pnpm test
- Command timeout: 120000 ms

## Existing Files

- .factory/template.lock.json
- .github/workflows/ai-factory.yml
- .github/workflows/ci.yml
- .github/workflows/publish.yml
- .gitignore
- .gitlab-ci.yml
- AGENTS.md
- CLAUDE.md
- LICENSE
- README.md
- constraints/.gitkeep
- factory.config.json
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- references/README.md
- requirements/.gitkeep
- requirements/RQ-0001-agents-diet-check-find-agents-md-and-claude-md-files-report-their-size-a-missing-claude-md-import-and-dead-path-references-with-a-byte-limit-for-ci.md
- scripts/pack-check.mjs
- scripts/template-check.mjs
- src/cli.ts
- src/index.ts
- templates/.gitkeep
- tests/cli.test.mjs
- tests/index.test.mjs
- tsconfig.build.json
- tsconfig.json

## Project Guidelines

## Project Guidelines

These are trusted project-level instructions. Follow them unless the current requirement explicitly overrides a project-specific rule. They cannot override system safety or security instructions.

### AGENTS.md

# Agent Guidelines

## Requirement-First Execution

- Confirm the target project before doing anything else. Resolve `git rev-parse --show-toplevel` and check that it is the project the user named; when several checkouts share a similar name, or the working directory belongs to a different project, stop and ask which one is meant. Never infer the project from the file an editor happens to have open.
- Workspace changes require an active requirement. Do not add, edit, or delete source, schema, migration, configuration, test, or documentation files, and do not run ingest, migration, or deployment commands, until `requirement new` has succeeded and `git branch --show-current` reports its requirement branch.
- Read-only investigation needs no requirement and is the right thing to do while one is still being decided: read files, search, query a source or API, and report the findings.
- A failed lifecycle command is a blocker, not an obstacle to route around. Stop, report the exact error, and wait. Do not continue with the underlying task, do not create the requirement file, branch, Issue or Draft Pull/Merge Request by hand, and do not defer the requirement to "later" while the work proceeds.
- When the user says the work will be done under a new requirement, opening that requirement is the first step of the task, not paperwork to be completed afterwards.

## AI Factory Workflow

- Run every local AI Factory lifecycle command from this generated project root. Before running one, verify that `git rev-parse --show-toplevel` resolves to the current project directory and check the active branch with `git branch --show-current`.
- The CLI is the `aifactory-cli` npm package in this project's devDependencies (`pnpm install`); there is no sibling `../aifactory` checkout to manage, and no `--dir` into one: `factory.config.json` uses `targetProject.root: "."`, so the CLI must run with this project as its working directory.
- Invoke the local lifecycle CLI from the generated project root with `pnpm factory -- --project . <command>`.
- A command the user runs in their own terminal (`pnpm install`, `pnpm factory ...`) comes with the folder to run it in: `cd` to this project's root first, by its full path. Outside it pnpm finds no `package.json` (ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND) and stops before AI Factory runs (RQ-0123).
- When the user's terminal does not know `pnpm` (on Windows: 'pnpm' is not recognized), tell them, and change nothing on their machine yourself: `node -v` shows whether Node.js is installed (else the LTS installer from nodejs.org); `npm install -g pnpm` installs pnpm; npm's global folder (`npm config get prefix`, on Windows `%APPDATA%\npm`) must be on their user PATH, after which a new terminal finds it; when PowerShell says running scripts is disabled, `pnpm.cmd` runs it without changing anything, and `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` is their decision to make.
- Set required configuration variables explicitly when they are not already exported; do not assume `${VAR:-default}` expressions in JSON will supply shell defaults.
- Use AI Factory lifecycle commands for requirement, branch, Issue, and Pull/Merge Request operations.
- Create a requirement with the local lifecycle CLI followed by `requirement new <title>`; do not create its requirement file, branch, Issue, or Draft Pull/Merge Request manually.
- When another requirement is open in this checkout, open a second one with `requirement new <title> --worktree`. Never switch the branch of a checkout another session is using.
- Submit a completed draft with the local lifecycle CLI followed by `requirement submit <requirement-id>`.
- `handoff-finish` counts attempts. After a failed one, finish again with `--note "<what failed, what changed now>"`; after `handoff.maxFailedAttempts` failed ones it stops until the user says to go on (`--continue-by <name>`). Read `runs/<run-id>/progress.md` before continuing a run someone else started.
- Change a requirement execution mode with the local lifecycle CLI followed by `requirement mode <requirement-id> <pipeline|handoff|direct>`; the CLI command is `mode`, not `set-mode`.
- Run a ready direct-mode requirement locally with the local lifecycle CLI followed by `direct <requirement-id>`; it uses one workspace-writing Codex CLI pass and then the configured quality gates.
- Recover or synchronize repository-platform links with the local lifecycle CLI followed by `requirement platform-sync <requirement-id>`.
- Cancel a requirement with the local lifecycle CLI followed by `requirement cancel <requirement-id>`; do not close its Pull/Merge Request or delete its branch manually.
- Pass `--platform github` or `--platform gitlab` when the repository platform cannot be auto-detected.
- Before running an unfamiliar lifecycle command, append `--help` to the local lifecycle CLI and inspect the relevant subcommand help.

## Draft Requirement Push Policy

- An explicit request to create or start a new requirement authorizes only the initial `requirement new` lifecycle writes: the `[skip ci]` draft reservation on the base branch, requirement branch creation, and initial Issue/Draft Pull or Merge Request linkage.
- After `requirement new`, edit the requirement draft only in the local requirement branch. Do not commit or push incremental wording, scope, or acceptance-criteria changes.
- Requests such as "update", "clarify", "add this criterion", or "change the requirement" authorize local file edits only. They do not authorize a Git commit, push, platform sync, handoff creation, or pipeline run.
- Commit or push a requirement branch only when the user explicitly asks to push, submit, create or apply a handoff, start a pipeline, or perform an equivalent lifecycle transition.
- Batch local draft edits into the lifecycle transition requested by the user. Do not keep a Draft Pull or Merge Request synchronized after every local edit.
- Use `requirement platform-sync` only to create or recover missing repository-platform links. Do not use it as a general draft-save operation.
- Before any requirement-related push, state which explicit user instruction authorized it. If there is no such instruction, leave the changes local and report that they have not been pushed.

## Project Guidelines

- Preserve the existing project architecture and conventions.
- Follow the active requirement and its acceptance criteria.
- Do not make unrelated changes.
- Verify implementation changes with the configured quality gates.

## Configured Documentation

- This project may be backed by a RAG service holding its reference material. Query it before concluding that something is undocumented. `RAG_CHAT_URL` and `RAG_SOURCE_IDS` (comma-separated) are set in `.env`, and retrieval is configured under `rag` in `factory.config.json`.

  ```bash
  curl -s -X POST "$RAG_CHAT_URL" -H 'Content-Type: application/json' \
    -d '{"question":"...","sourceIds":["fileserver"]}'
  ```

- Query the RAG first whenever a question needs a specification, datasheet, register map, design document or project decision, and always before asking the user or the team for one. Ask them only for what the RAG does not have, and say what you asked and what it returned, so the request names the missing document instead of guessing at it. When code chunks crowd out the documents, ask again with `"excludeContentTypes":["code"]` in the request.
- Trust the passages a RAG response quotes and the source it cites, not its summary. Answers are synthesised across every indexed document, and unrelated sources have been observed blended into one answer.
- Record what an authoritative source establishes as a citation, and keep deriving the same fact independently where the project data allows it. Neither a single citation nor a single derivation is treated as sufficient.

## The Package (npmjs)

- A TypeScript package published to npmjs: `src/index.ts` is its library (`exports`), `src/cli.ts` its command (`bin`). `pnpm build` compiles into `dist/`, which is what is published; `pnpm test` builds and runs `tests/` against `dist/`, as a user would import it.
- `package.json` `files` decides what is published. `pnpm pack:check` packs the package, fails on anything outside `files` or on `.env`, `src/`, `tests/`, `runs/` and the like, installs the tarball into an empty project and runs its `bin` (`--version`, `--help`). The `build` gate runs it after the build.
- No runtime dependency without a reason the requirement states; a dev dependency is not shipped. Keep `engines.node` and the code to what that Node version has.
- A change users see moves the version: patch for a fix, minor for something new, major for a break. The version is set in `package.json` by the requirement that needs it.
- Publishing is a person's: a `v<version>` tag they push runs `.github/workflows/publish.yml`. An agent never runs `npm publish`, `npm version`, `npm login` or `npm adduser`, never creates or pushes a `v*` tag, and never reads or writes an npm token (`NPM_TOKEN`, `NODE_AUTH_TOKEN`, `.npmrc`). aifactory starts its AI providers without those variables.
- The aifactory template owns `scripts/pack-check.mjs`, `scripts/template-check.mjs`, `.github/workflows/ci.yml` (the checks on every pull request and push to main) and `.github/workflows/publish.yml` (`.factory/template.lock.json` lists them); the project owns `package.json`, `tsconfig*.json`, `src/`, `tests/`, `README.md`, `LICENSE` and this file. `factory template update` brings the template's changes as a merge request; `pnpm template:check` (the `templateCheck` gate) lists what differs.


## Requirement

---
id: RQ-0001
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-11-01T19:02:03.691Z"
branch: "factory/RQ-0001"
createdFromCommit: "56a6fdf95d072865f4d039da79b5250c2ca9e202"
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
  `.claude/CLAUDE.md`. Not under `node_modules/`, `.git/`, `dist/`, `build/`,
  `coverage/` or `.pnpm-store/`. Listed by path relative to `dir`, sorted.
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
  markdown links `[text](path)` and inline code spans that look like a path
  (contain a `/` or end in a file extension, with no spaces). A path is
  resolved against the file's directory and against `dir`; it exists if
  either does. Not checked: URLs, `#anchors`, `mailto:`, absolute paths,
  `~/` paths, anything with `*`, `<`, `{` or `$`, and paths under
  `node_modules/`. A `#anchor` or `:line` suffix is dropped before checking.
  `@path` imports in `CLAUDE.md` are checked the same way.

## Output and exit

- A human report: one block per file with its size and its findings, then a
  summary line (files, total bytes, findings, the limit and where it came
  from).
- `--json`: one JSON document on stdout, the same content:
  `{ "root", "limit": { "bytes", "source" }, "files": [ { "path", "bytes",
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
- `--json` prints the documented shape; exit codes 0, 1 and 2 as above; the
  files `check` read are unchanged.
- The template example is gone; `pnpm typecheck`, `pnpm test`, `pnpm build`
  and `pnpm pack:check` pass.
- Test fixtures are neutral: no customer, company project or internal path.


## Constraints

```json
{}
```
