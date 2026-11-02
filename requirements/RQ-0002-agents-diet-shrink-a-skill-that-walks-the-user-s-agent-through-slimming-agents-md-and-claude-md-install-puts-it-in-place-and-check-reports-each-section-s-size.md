---
id: RQ-0002
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-11-02T13:31:32.858Z"
branch: "factory/RQ-0002"
createdFromCommit: "bcbd9ceec0667d8717519948f6af76a5ef579816"
completedRunId: "20261102133241-RQ-0002"
completedBy: "human"
completedAt: "2026-11-02T18:48:51.185Z"
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
