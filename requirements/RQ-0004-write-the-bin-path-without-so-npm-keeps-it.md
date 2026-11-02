---
id: RQ-0004
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-11-02T20:43:49.579Z"
branch: "factory/RQ-0004"
createdFromCommit: "c8c0dfd3c87882346621c9099902001d23cccc63"
completedRunId: "20261102204453-RQ-0004"
completedBy: "human"
completedAt: "2026-11-02T20:50:49.006Z"
githubPullRequestUrl: "https://github.com/baturorkun/agents-diet/pull/8"
githubPullRequestIid: 8
githubIssueUrl: "https://github.com/baturorkun/agents-diet/issues/7"
githubIssueIid: 7
repositoryProvider: github
---
# RQ-0004 - Write the bin path without ./ so npm keeps it

The first publish of `v0.1.0` (publish run 41509340818) warned:

```
npm warn publish "bin[agents-diet]" script name dist/cli.js was invalid and removed
```

npm 11 rejects a `bin` path that starts with `./`. `package.json` has
`"agents-diet": "./dist/cli.js"`, so npm drops the command from the registry
manifest: the package installs, the `agents-diet` command does not. A local
`pack:check` never sees it, because a local install reads the tarball's
`package.json`, where the path survives.

Write the path as `dist/cli.js`. npm's own convention has no `./` in `bin`
(it is required in `exports` and `types`, which is where the form came from).
A test guards the convention so a later edit cannot bring it back.

The version stays 0.1.0: nothing has been published under it.

## Acceptance Criteria

- `package.json` `bin` is `{ "agents-diet": "dist/cli.js" }`.
- A test fails when any `bin` value in `package.json` starts with `./` or `/`, or does not point at a file `pnpm build` produces.
- `npm publish --dry-run` (npm ≥ 11.5) prints no `bin[...] ... was invalid and removed` warning for the packed package.
- `pnpm test`, `pnpm pack:check` and `pnpm template:check` pass; `agents-diet --version` from the installed tarball prints `0.1.0`.
