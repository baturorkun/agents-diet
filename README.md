# agents-diet

Put your `AGENTS.md` and `CLAUDE.md` on a diet: find what makes your agent
instructions too big, unread or out of date.

Agent instruction files are loaded into every session in full. They grow, and
then they cost more than they give, or they stop being read at all:

- Codex cuts a project's instruction files at **32 KiB** by default
  (`project_doc_max_bytes`); the rest is never seen.
- Claude Code reads `CLAUDE.md`, **not `AGENTS.md`**. A project with only
  `AGENTS.md` gives Claude Code none of its rules, unless a `CLAUDE.md` imports
  it with the line `@AGENTS.md`.
- Paths in the instructions point at files that were moved or deleted long ago.

## Two commands

```sh
npx agents-diet check            # measure and diagnose; changes nothing
npx agents-diet init             # give your agent the method to shrink
```

`check` tells you what is wrong. Shrinking takes judgement (is this section a
rule for every session, a procedure, a design note, history?), so that is done
by your own agent, Claude Code or Codex, following the skill `init` puts in
place. agents-diet never calls a model itself.

## check

```
AGENTS.md  20,143 bytes  ~4,994 tokens
  ✗ no CLAUDE.md beside it: Claude Code does not read AGENTS.md (add a CLAUDE.md with the line @AGENTS.md)
  ✗ scripts/deploy-v1.sh does not exist
src/api/AGENTS.md  1,820 bytes  ~455 tokens
  ✓ no finding

2 file(s), 21,963 bytes, 2 finding(s); limit 32768 bytes (default)
```

What `check` looks at:

- every `AGENTS.md` and `CLAUDE.md` in the project, and `.claude/CLAUDE.md` (in a
  Git checkout, the files Git tracks or would track; `node_modules/`, `dist/`
  and the like never);
- **size**: bytes, characters and an estimate of tokens; a file over the limit
  is a finding;
- **Claude Code**: a directory with `AGENTS.md` and no `CLAUDE.md`, or a
  `CLAUDE.md` that does not import it;
- **dead references**: paths in links and in `code spans` that do not exist.
  Code (`config.value`), commands, URLs, globs, absolute paths and paths Git
  ignores are not taken for paths. A file named without a directory is looked
  for anywhere in the project.

`check` only reads. It exits 0 with no finding, 1 with findings and 2 on a
usage error, so it works as a CI step:

```sh
npx agents-diet check --max-bytes 16384
```

### Sections

Each file is also broken down by heading (`--json`: `files[].sections`, with
`bytes`, `numberedSteps`, `codeBlocks` and the `paths` it names); the human
report lists the sections over 1 KiB, largest first. That is what the skill
works from when it decides what to move.

## init

```sh
npx agents-diet init             # .claude/skills/agents-diet/SKILL.md
npx agents-diet init --codex     # .codex/skills/agents-diet/SKILL.md too
```

Then ask your agent: *"put AGENTS.md on a diet"*. Following the skill it:

1. runs `agents-diet check --json` and stops if there is nothing to shrink;
2. fixes what is broken (a missing `CLAUDE.md`, dead paths);
3. classifies every section, first match wins: **delete** (history, what the
   code or a linter already enforces), **global** (a block shared by your
   projects, moved to `~/.claude/CLAUDE.md` with your leave), **skill** (a
   procedure, moved to `.claude/skills/<name>/`), **docs** (one area's rules,
   moved to `docs/<area>.md` with one pointer line left behind),
   **subdirectory** (rules for one directory), **keep**;
4. rewrites what stays: imperative, one sentence per rule, no ticket trails;
5. keeps `CLAUDE.md` importing `AGENTS.md`, with no rule in both;
6. measures again and reports before/after, what moved where, what was deleted
   and why, leaving the changes uncommitted for you.

It never invents a rule, changes a rule's meaning, deletes what it does not
understand, writes outside the project without asking, or commits.

A copy you edited is kept on the next `init` (`--force` replaces it); a copy
from an earlier agents-diet is updated.

## Settings

In `package.json`, or the same keys in `.agents-diet.json`:

```json
"agents-diet": {
  "maxBytes": 16384,
  "ignore": ["runs/"]
}
```

- `maxBytes`: the size limit per file (default 32768). `--max-bytes` wins.
- `ignore`: paths left out, such as copies of instruction files kept under
  version control. Files under them are not checked, references into them are
  not reported.

## Library

```js
import { check, init } from 'agents-diet';

const report = check('.', { maxBytes: 16384 });
console.log(report.summary); // { files, bytes, findings }
console.log(report.files[0].sections.map((s) => [s.heading, s.bytes]));

init('.', { targets: ['claude'] }); // what the CLI's init does
```

`check` returns what `--json` prints. No runtime dependencies; Node 20 or later.

## Publishing

A version is published by its tag, from `.github/workflows/publish.yml`: set
`version` in `package.json`, commit, push, then tag that commit `v<version>`
and push the tag. The workflow checks the tag against `package.json`, runs the
checks and publishes with the repository secret `NPM_TOKEN`.

## License

MIT
