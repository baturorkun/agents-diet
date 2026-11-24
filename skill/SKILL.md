---
name: agents-diet
description: Make a project's AGENTS.md, CLAUDE.md or GEMINI.md smaller, leaner or faster to load without losing a rule. Use when asked to shrink, trim, slim, diet, clean up, split or reorganise agent instruction files, or when agents-diet check reports a file over its limit. Not for editing source code or for writing new rules.
agents-diet-version: 0.2.0
---

# Put AGENTS.md / CLAUDE.md on a diet

Instruction files are loaded into every session in full. This skill lightens that load without losing a rule: each rule stays as written, moves word for word to a place that loads only when needed, or is removed for a stated reason. `agents-diet` measures; you judge.

The goal is that the agent loads, finds and follows each rule when a task needs it. Size is not the goal: never move or delete a rule only to make a file shorter, and never present "X% smaller" as the result. What counts is one source for each rule, nothing loaded in every session that few tasks need, and no rule that must be changed in two places at once.

## Limits

- If `CLAUDE.md` or `AGENTS.md` is missing you may create it. If it exists, edit it; never write it again from scratch.
- Move text word for word. Never shorten, summarise, merge, reformat or reword a rule, whether you move it or leave it. The only exception is step 7, after the user's explicit yes.
- Never invent a rule, and never change a rule's meaning.
- Never delete a rule you do not understand. Ask, or leave it in place.
- Change only instruction files, and create only new skills (`.agents/skills/<name>/` and `.claude/skills/<name>/`) and new docs (`agents-docs/<topic>.md`). Never add a new document to an existing `docs/` folder, and never touch code or other files.
- Never write outside the project, such as a global instruction file in the home directory, without the user's permission.
- Never copy a secret (a password, token or key) to another file, and never print it.
- Keep each rule in its language. A rule written in Turkish stays in Turkish.
- Never commit, push or publish.
- If you are asked only to check or audit the files, change nothing and report.
- Create a skill only for a procedure, never just to make a file shorter. Do not add hooks, scripts or other tooling.

## 1. Measure

Run `npx agents-diet check --json` (`npx agents-diet@latest check --json` when the project does not pin it). Then list what loads in every session: the root `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, files they pull in with `@path` lines, and the descriptions of project skills. Note these files in subdirectories too; they load when work happens there.

Note which agents read these files (`CLAUDE.md`: Claude Code; `AGENTS.md`: Codex, Cursor, GitHub Copilot, Antigravity; `GEMINI.md`: Gemini CLI). Whatever you change must still load for each of them.

Length alone decides nothing. A long file, or a rule the agent keeps ignoring, is a reason to look, not to cut. When you are told the file is too big or asked to trim it, first find out what goes wrong (a rule ignored, a limit hit), then measure and classify. Being asked to slim a file down does not oblige you to cut it: if nothing is out of place, say so and change nothing. Asked again ("still too big") with nothing left out of place, say that what remains is needed and that cutting more would lose rules.

## 2. Fix what is broken

- `missing-claude-md` (a warning): recent Claude Code reads `AGENTS.md` without a `CLAUDE.md`, older versions and some sessions do not. Propose creating `CLAUDE.md` beside it with the line `@AGENTS.md`.
- `no-agents-import`: add the line `@AGENTS.md` to that `CLAUDE.md`. While a `CLAUDE.md` is there, Claude Code reads it and not `AGENTS.md`.
- `no-gemini-import` (a warning): add the line `@AGENTS.md` to that `GEMINI.md`. Gemini CLI reads `GEMINI.md` and not `AGENTS.md` unless its settings say otherwise.
- `over-limit-combined`: the `AGENTS.md` files from the root down to this one are over the limit together; Codex reads them as one. Treat it like a file over the limit.
- `dead-reference`: verify each one before acting. The checker can still report live references: a command name, a file the program creates when it runs. Search the project for the name. When the file moved, correct the path. When it is gone for good, remove the sentence that names it. A reference you confirm as live stays exactly as written.
- `reference-elsewhere` (a warning): the path is live; it exists where the message says, written relative to a package or subdirectory. Never delete or "fix" it; you may only make it precise by writing a path the message names.

## 3. Classify every section

Read every section and decide where it belongs. The first match wins.

1. **Delete:** history that no longer applies; what the code or a config already states; a rule a formatter, linter, hook or CI enforces (name it). Only when you are sure.
2. **Global:** not about this project (a personal working style), or a block other projects carry word for word. Propose it for the user's global file of each agent they use: `~/.claude/CLAUDE.md` (Claude Code), `~/.codex/AGENTS.md` (Codex), `~/.gemini/GEMINI.md` (Gemini CLI, Antigravity). Ask which agents they use.
3. **Skill:** a procedure, something to *do*: numbered steps, steps told in prose ("first… then… finally…"), or a heading such as deploy, release, migrate, set up, add a new X.
4. **Docs:** something to *know*, needed only now and then: details of a little-used tool, service or document; a long architecture or data-model description; tables of settings; rules for one area of the code that matter only when working on it.
5. **Subdirectory:** rules that apply under one directory only.
6. **Keep:** what every session needs: the language to answer in, the architecture in a paragraph, the never-do list, how to run the checks, the branch and review workflow.

When a section mixes kinds, split it and place each part on its own; the text of each part stays word for word.

While you read, also note:
- **Duplicates:** the same rule written twice. Keep one copy, unchanged.
- **Contradictions:** two rules that ask for opposite things. Do not choose; report both.
- **Unclear rules:** a rule whose meaning you cannot find in the project (an unknown person, freeze, flag or deadline). Do not guess; ask.

When a section is hard to place, read `references/examples.md`: one worked example per decision.

## 4. Ask before you change

- **A person is in the session:** ask with your tool for multiple-choice questions, if you have one (its name differs by agent: AskUserQuestion, ask_user, AskQuestion, request_user_input). Put the proposed skills in one multi-select question, each with its name as the label and its one-line description. For every proposal show the text it concerns (or its heading and first line), where it would go, your basis (the file, config or rule that shows it), and what changes for the agent. Ask each unclear rule, each contradiction and each global block as its own question. Without such a tool, write the proposals as a numbered list, end your turn and wait for the answer.
- **Nobody can answer (an unattended run):** do only what needs no answer; leave the rest in place.

Change nothing the user did not agree to. Create only the skills they chose.

## 5. Apply

- **Skill:** write the same `SKILL.md` to `.agents/skills/<name>/` (read by Codex, Gemini CLI, Antigravity, Cursor, GitHub Copilot) and `.claude/skills/<name>/` (read by Claude Code). Frontmatter `name` and a one-line `description` that says when it applies ("Use when …"). The body is the procedure, word for word, steps in their order. Fix an existing project skill whose `name` or `description` is missing.
- **Docs:** `agents-docs/<topic>.md` at the project root, the section word for word. Create the folder if it is missing. Never put it in a `docs/` folder, at the root or in a subproject: that folder belongs to the project and may be a published site.
- **Subdirectory:** that directory's `AGENTS.md`, with a `CLAUDE.md` beside it that holds `@AGENTS.md` (and a `GEMINI.md` with the same line when the project uses `GEMINI.md`).
- **Pointer:** leave one plain line at the old place that says when to read the new one: "Before working on <topic>, read `agents-docs/<topic>.md`." In a subdirectory file, write the path relative to that file (`../agents-docs/<topic>.md`). Never use an `@` line for this: an import loads the file in every session again. Open the target first and confirm the moved text is there in full.
- **What stays** stays word for word. Removing a duplicate, a dead reference or a section you were told to delete is allowed; rewording a rule that stays is not.

`AGENTS.md` holds the shared rules. `CLAUDE.md` and `GEMINI.md` each either import it and add only what is specific to their agent, or are the only file. No rule is written twice.

Before you finish, read `references/anti-patterns.md` and check your changes against it.

## 6. Report

Run `npx agents-diet check --json` again, then report:

- bytes loaded in every session, before and after, and the size of each instruction file;
- each section moved, and where; each section deleted, and why;
- each dead-reference finding and what you did with it, including the ones you found live;
- duplicates removed and contradictions found;
- under a heading named "Questions": everything you asked, or would have asked;
- what you could not verify.

Label every change as one of: moved word for word, duplicate removed, corrected (name the current source: a file, a config), or deleted (and why). Report the bytes as a measurement, not as an achievement. Stop when the checks are done.

Leave the changes uncommitted for the user to review.

## 7. Offer a rewrite

Only with a person in the session, and only after the report. Ask one question: "Shall we rewrite?" Ask it also when everything follows the rules and nothing got smaller. Say that commands, paths, numbers and prohibitions will not change, and that the new version is written to a separate `<name>.rewrite.md` file. You then ask for approval in the chat: on approval the `.md` is changed; a correction is fixed and asked again; at the end the temporary file is removed. Without an explicit yes, change nothing. In an unattended run, skip this step and never rewrite.

On yes, read `references/rewrite.md` and follow it.
