# Manual Handoff

Run ID: `20261102133241-RQ-0002`

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
- requirements/RQ-0002-agents-diet-shrink-a-skill-that-walks-the-user-s-agent-through-slimming-agents-md-and-claude-md-install-puts-it-in-place-and-check-reports-each-section-s-size.md
- scripts/pack-check.mjs
- scripts/template-check.mjs
- src/check.ts
- src/cli.ts
- src/index.ts
- templates/.gitkeep
- tests/check.test.mjs
- tests/cli.test.mjs
- tests/helpers.mjs
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
id: RQ-0002
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-11-02T13:31:32.858Z"
branch: "factory/RQ-0002"
createdFromCommit: "bcbd9ceec0667d8717519948f6af76a5ef579816"
githubPullRequestUrl: "https://github.com/baturorkun/agents-diet/pull/4"
githubPullRequestIid: 4
githubIssueUrl: "https://github.com/baturorkun/agents-diet/issues/3"
githubIssueIid: 3
repositoryProvider: github
---
# RQ-0002 - agents-diet shrink: a skill that walks the user's agent through slimming AGENTS.md and CLAUDE.md, install puts it in place, and check reports each section's size

`agents-diet check` (RQ-0001) measures and diagnoses; nothing yet makes a
file smaller. Shrinking takes judgement: whether a section is a rule for every
session, a procedure for one kind of task, a design note for one area of the
code, a block shared by several projects, or history. That judgement is the
user's own agent's (Claude Code, Codex): agents-diet gives it the method and
the measurements, and never calls a model itself.

This requirement adds the method as a skill, a command that installs it, and
the per-section measurements the skill works from.

## The skill

`skill/SKILL.md` in the package (published; `files` gains `skill`), with a
frontmatter `name: agents-diet` and a `description` that triggers on making an
`AGENTS.md`/`CLAUDE.md` smaller, leaner or faster to load. Its body is the
procedure the agent follows:

1. **Measure first.** Run `npx agents-diet check --json` (the package pinned
   in the project, else `npx agents-diet@latest`). With no finding and every
   file well under the limit, say so and stop: nothing to shrink.
2. **Fix what is broken.** A missing `CLAUDE.md` gets the line `@AGENTS.md`;
   a dead reference is corrected or the sentence dropped.
3. **Classify each section** (from `sections` in the report), in this order,
   first match wins:
   - **Delete:** history ("on 12 October we tried..."), what the code or a
     config already shows, a rule a formatter, linter, hook or CI already
     enforces (say which one).
   - **Global:** a block identical in several projects, or not about this
     project at all (a working-style policy): move once to the user's global
     file (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) and remove here.
     Writing outside the project is asked about first.
   - **Skill:** a procedure, told by numbered steps or a heading like deploy,
     release, migrate, rollback, setup: a new skill of the project
     (`.claude/skills/<name>/SKILL.md`, and the Codex equivalent when the
     project uses Codex), with a one-line description saying when it applies.
   - **Docs:** rules for one area of the code (long, naming one subsystem's
     files and functions): `docs/<area>.md`, and one line at the root:
     "before touching <area>, read docs/<area>.md".
   - **Subdirectory:** rules that apply only under one directory: that
     directory's `AGENTS.md`/`CLAUDE.md`.
   - **Keep:** what every session needs: language, the architecture in a
     paragraph, the never-do list, how to run the checks.
4. **Rewrite what stays**: imperative, one sentence per rule, no rationale
   longer than a clause, no `(RQ-…)`/ticket trails unless the project asks
   for them.
5. **Keep the two files in step:** `CLAUDE.md` imports `AGENTS.md` (or is
   the only file); the same rule is never in both.
6. **Measure again** and report before/after per file, what moved where, and
   what was deleted and why. Leave the changes uncommitted for the user.

Things the skill tells the agent not to do: invent rules, change a rule's
meaning while moving it, delete a rule it does not understand (ask), touch
files outside the project without asking, run `git commit`.

## `agents-diet install`

`agents-diet install [dir]` copies the skill into the project:
`.claude/skills/agents-diet/SKILL.md`, and `.codex/skills/agents-diet/SKILL.md`
when `dir` has a `.codex/` directory or `--codex` is given (`--claude` /
`--codex` select explicitly; both by default when both directories exist,
Claude Code alone when neither does). An existing copy is replaced only when
it is the package's own earlier version (a marker line in the frontmatter:
`agents-diet-version: <version>`); a changed file is kept and reported, and
`--force` replaces it. Prints what it wrote. Exit 0; 2 on usage errors.

## `check`: sections

Each file in the report gains `sections`: one entry per heading of level 1–3,
in order, with `heading`, `level`, `bytes` (the heading line through the line
before the next heading of the same or a higher level), `numberedSteps`
(count of lines starting with `1.`/`2.`… or `- [ ]`), `codeBlocks` (fenced
blocks), and `paths` (the referenced paths of RQ-0001 that fall in it). Text
before the first heading is a section with `heading: null`. The human report
lists sections over 1 KiB under the file, largest first, with their bytes.

## Out of scope

Shared blocks across several projects found by `check` itself; a `--fix`;
running a model.

## Acceptance Criteria

- `skill/SKILL.md` ships in the tarball (`pack:check` passes with `files`
  including `skill`), has the frontmatter `name`, `description` and
  `agents-diet-version` equal to `package.json` version (a test compares
  them), and its body contains the six steps and the never-do list above.
- `install` writes the Claude Code copy by default, the Codex copy with
  `.codex/` present or `--codex`, replaces only the package's own earlier
  copy, keeps a changed one unless `--force`, and exits 2 on an unknown
  option or a `dir` that is not a directory; tests show each.
- `check --json` reports `sections` as specified on a fixture with nested
  headings, a preamble, numbered steps, code blocks and paths; the human
  report lists sections over 1 KiB largest first.
- A manual trial on a neutral fixture project (an `AGENTS.md` with history, a
  deploy procedure, a design section and a shared policy block) is recorded in
  the run's notes: the agent, following the skill, produced a root file under
  half the size, a skill, a docs file, and no rule lost; this is read, not
  automated.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm pack:check` pass; no
  customer, company project or internal path in fixtures or the skill.


## Constraints

```json
{}
```
