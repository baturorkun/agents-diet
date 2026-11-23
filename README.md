# agents-diet

Put your `AGENTS.md` and `CLAUDE.md` on a diet: find what makes your agent
instructions too big, unread or out of date.

Agent instruction files are loaded into every session in full. They grow, and
then they cost more than they give, or they stop being read at all:

- Codex joins every `AGENTS.md` from the project root down and stops at
  **32 KiB** in total by default (`project_doc_max_bytes`); the rest is never seen.
- Claude Code reads `CLAUDE.md`; it reads `AGENTS.md` only when there is no
  `CLAUDE.md` (from version 2.1.277, and not in every session). A `CLAUDE.md`
  that does not import `AGENTS.md` with the line `@AGENTS.md` hides its rules.
- Gemini CLI reads `GEMINI.md`, and `AGENTS.md` only when its settings name it.
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
  ⚠ no CLAUDE.md beside it: Claude Code reads AGENTS.md only from version 2.1.277 and not in every session (add a CLAUDE.md with the line @AGENTS.md to be safe)
  ✗ scripts/deploy-v1.sh does not exist
src/api/AGENTS.md  1,820 bytes  ~455 tokens
  ✓ no finding

2 file(s), 21,963 bytes, 2 finding(s) (1 warning(s)); limit 32768 bytes (default)
```

What `check` looks at:

- every `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` in the project, and `.claude/CLAUDE.md` (in a
  Git checkout, the files Git tracks or would track; `node_modules/`, `dist/`
  and the like never);
- **size**: bytes, characters and an estimate of tokens; a file over the limit
  is a finding, and so are nested `AGENTS.md` files over it together (Codex
  reads them as one);
- **Claude Code**: a `CLAUDE.md` that does not import the `AGENTS.md` beside it
  (an error); a directory with `AGENTS.md` and no `CLAUDE.md` (a warning);
- **Gemini CLI**: a `GEMINI.md` that does not import the `AGENTS.md` beside it
  (a warning);
- **dead references**: paths in links and in `code spans` that do not exist.
  Code (`config.value`), commands, URLs, globs, absolute paths and paths Git
  ignores are not taken for paths. A path is looked for relative to the file,
  then to the project root (also when written with a leading `/`, such as
  `/scripts/`); a file named without a directory anywhere in the project. A
  path found only further down, as the end of a longer path (`core/pom.xml` at
  `libs/core/pom.xml`), is not dead: it is a `reference-elsewhere` warning that
  names where it exists.

`check` only reads. It exits 0 with no error (warnings allowed), 1 with errors
and 2 on a usage error, so it works as a CI step:

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
npx agents-diet init             # .agents/skills/agents-diet/ and .claude/skills/agents-diet/
npx agents-diet init --claude    # Claude Code's location only
```

Then ask your agent: *"put AGENTS.md on a diet"*. Following the skill it:

1. runs `agents-diet check --json` and lists what loads in every session;
   length alone decides nothing, and a file with nothing out of place is left alone;
2. fixes what is broken: a `CLAUDE.md` or `GEMINI.md` that does not import
   `AGENTS.md`, dead paths (each one verified first);
3. classifies every section, first match wins: **delete** (history, what the
   code or a linter already enforces), **global** (not about this project,
   proposed for the global file of each agent you use), **skill** (a procedure,
   in numbered steps or in prose), **docs** (something to know only now and
   then), **subdirectory** (rules for one directory), **keep**;
4. asks before it changes anything: the proposed skills as one multiple-choice
   question, each unclear rule, contradiction and global block on its own;
5. moves text word for word: skills to `.agents/skills/<name>/` and
   `.claude/skills/<name>/`, docs to `agents-docs/<topic>.md` with one pointer line
   left behind; what stays is not reworded;
6. measures again and reports before/after, what moved where, what was deleted
   and why, and its questions, leaving the changes uncommitted for you.
7. asks at the end whether to rewrite. Only on your yes, and never unattended,
   it shortens wording section by section: commands, paths, numbers,
   prohibitions, conditions and order stay. `agents-diet rewrite check` rejects
   a section that lost one of them, shrank over 30% or saves under 100 bytes;
   you pick which accepted sections `agents-diet rewrite apply` writes.

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
console.log(report.summary); // { files, bytes, findings, errors, warnings }
console.log(report.files[0].sections.map((s) => [s.heading, s.bytes]));

init('.', { targets: ['agents', 'claude'] }); // what the CLI's init does
```

`check` returns what `--json` prints. No runtime dependencies; Node 20 or later.

## Publishing

A version is published by its tag, from `.github/workflows/publish.yml`: set
`version` in `package.json`, commit, push, then tag that commit `v<version>`
and push the tag. The workflow checks the tag against `package.json`, runs the
checks and publishes with the repository secret `NPM_TOKEN`.

## License

MIT
