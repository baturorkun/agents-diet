---
name: agents-diet
description: Make a project's AGENTS.md or CLAUDE.md smaller, leaner or faster to load without losing a rule. Use when asked to shrink, trim, slim, diet, clean up or reorganise agent instruction files, or when agents-diet check reports a file over its limit.
agents-diet-version: 0.1.0
---

# Put AGENTS.md / CLAUDE.md on a diet

Agent instruction files are loaded into every session in full. They grow until
they cost more than they give, or stop being read: Codex cuts them at 32 KiB,
Claude Code reads `CLAUDE.md` and not `AGENTS.md`. This skill shrinks them
without losing a rule: every rule either stays, moves to where it is loaded
only when needed, or is shown to be enforced elsewhere.

You do the judging. `agents-diet` does the measuring.

## 1. Measure first

Run the check and read it as JSON:

```sh
npx agents-diet check --json
```

(`npx agents-diet@latest check --json` when the project does not pin it.)

Read `files[].sections`: each heading of the file with its `bytes`,
`numberedSteps`, `codeBlocks` and `paths`. With no finding and every file well
under `limit.bytes`, say so and stop: there is nothing to shrink.

## 2. Fix what is broken

- `missing-claude-md`: create `CLAUDE.md` beside the `AGENTS.md` with the
  single line `@AGENTS.md`. Claude Code reads nothing else.
- `no-agents-import`: add the line `@AGENTS.md` to that `CLAUDE.md`.
- `dead-reference`: find where the file went and correct the path; if it is
  gone for good, drop the sentence that named it.

## 3. Classify every section

Go through `sections` in order. For each, the first rule that matches decides:

1. **Delete.** History ("on 12 October we tried…", "this used to…"); what the
   code or a config file already shows (a dependency list, a port number that
   is in `.env.example`); a rule a formatter, linter, pre-commit hook or CI
   already enforces. Say which tool enforces it when you delete it.
2. **Global.** A block that is not about this project (a working-style policy,
   a token-saving rule) or that other projects carry word for word. Move it
   once to the user's global file (`~/.claude/CLAUDE.md`, and
   `~/.codex/AGENTS.md` for Codex) and remove it here. **Ask before writing
   outside the project.**
3. **Skill.** A procedure: `numberedSteps` > 0, or a heading like deploy,
   release, migrate, rollback, setup, publish, onboarding. Make it a skill of
   the project at `.claude/skills/<name>/SKILL.md` (and
   `.codex/skills/<name>/SKILL.md` when the project has a `.codex/`
   directory), with a frontmatter `name` and a one-line `description` that
   says *when* it applies ("Use when deploying to the test stack, after the
   gates pass"). Move the steps as they are; do not shorten a procedure.
4. **Docs.** Rules for one area of the code: a long section naming one
   subsystem's files, tables, functions or commands. Move it to
   `docs/<area>.md`, and leave one line at the root: "Before touching
   <area>, read `docs/<area>.md`."
5. **Subdirectory.** Rules that apply only under one directory
   (`frontend/`, `migrations/`): move them into that directory's own
   `AGENTS.md` (and `CLAUDE.md` with `@AGENTS.md`). They load only when work
   happens there.
6. **Keep.** What every session needs: the language to answer in, the
   architecture in a paragraph, the never-do list, how to run the checks, the
   requirement/branch workflow. This stays at the root.

When a section mixes kinds, split it and classify the parts.

## 4. Rewrite what stays

- Imperative, one sentence per rule. "Run `pnpm test` before a push", not "it
  is generally a good idea to…".
- A rationale of one clause at most, only where the rule surprises.
- No ticket or requirement trails (`(RQ-0051, RQ-0052)`) unless the project's
  own rules ask for them.
- No duplicated rule: when the same rule stands in two places, keep one.

## 5. Keep the two files in step

`CLAUDE.md` either imports `AGENTS.md` (the line `@AGENTS.md`) and adds only
what is Claude Code-specific, or is the only file. The same rule is never
written in both.

## 6. Measure again and report

Run `npx agents-diet check --json` once more. Report:

- bytes before and after, per file;
- every section that moved, and where it went;
- every section deleted, and why (which tool or file already covers it);
- anything you were unsure about and left in place.

Leave the changes uncommitted. The user reviews and commits.

## Never

- Invent a rule, or change a rule's meaning while moving or rewriting it.
- Delete a rule you do not understand. Ask.
- Write outside the project without asking first.
- Shorten a procedure's steps to save bytes: move it whole.
- Run `git commit`, `git push` or any command that publishes.
