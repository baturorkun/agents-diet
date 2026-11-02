---
id: RQ-0003
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-11-02T19:04:39.907Z"
branch: "factory/RQ-0003"
createdFromCommit: "5c5014eb701d2745f8726a105cd31fee5b45b64d"
githubPullRequestUrl: "https://github.com/baturorkun/agents-diet/pull/6"
githubPullRequestIid: 6
githubIssueUrl: "https://github.com/baturorkun/agents-diet/issues/5"
githubIssueIid: 5
repositoryProvider: github
---
# RQ-0003 - The command that puts the skill in place is init, not install

`agents-diet install` (RQ-0002) copies the skill into the project. Its name
reads as npm's `install`: a user takes it for installing the package, and the
two steps (`npm install -D agents-diet`, then this) blur into one. The command
prepares the project for agents-diet, which is what `init` means on the command
line (`git init`, `npm init`, `eslint --init`), and the name still fits when
the preparation grows (a settings file, say).

The package is not published yet, so the old name is dropped, not aliased.

## What changes

- The command is `agents-diet init [dir] [--claude] [--codex] [--force]`,
  with the behaviour of RQ-0002's `install` unchanged.
- The library exports `init` (and the types `InitOptions`, `InitResult`,
  `InitTarget`); `src/install.ts` becomes `src/init.ts`,
  `tests/install.test.mjs` becomes `tests/init.test.mjs`.
- `install` is an unknown command (exit 2) and the help names `init`
  everywhere: CLI help, README, the skill where it tells the user how to put
  itself in place, if it does.

## Acceptance Criteria

- `agents-diet init` does what `install` did (the RQ-0002 tests, renamed,
  pass); `agents-diet install` exits 2 with "Unknown command".
- No `install` remains in `src/`, `tests/`, `README.md` or `skill/` as the
  name of this command (`npm install` in the README's install line stays).
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm pack:check` pass.
