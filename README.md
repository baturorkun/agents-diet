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

## Usage

```sh
npx agents-diet check          # the current directory
npx agents-diet check path/to/project --json
```

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
import { check } from 'agents-diet';

const report = check('.', { maxBytes: 16384 });
console.log(report.summary); // { files, bytes, findings }
```

`check` returns what `--json` prints. No runtime dependencies; Node 20 or later.

## Publishing

A version is published by its tag, from `.github/workflows/publish.yml`: set
`version` in `package.json`, commit, push, then tag that commit `v<version>`
and push the tag. The workflow checks the tag against `package.json`, runs the
checks and publishes with the repository secret `NPM_TOKEN`.

## License

MIT
