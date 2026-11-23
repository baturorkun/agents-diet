---
id: RQ-0008
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Mustafa Bulut"
createdByEmail: "147878765+mustafaBulut1@users.noreply.github.com"
createdAt: "2026-11-23T15:31:25.447Z"
branch: "factory/RQ-0008"
createdFromCommit: "e437540fffabae8ab92adeac104dbd9f52e3d538"
githubPullRequestUrl: "https://github.com/mustafaBulut1/agents-diet/pull/8"
githubPullRequestIid: 8
githubIssueUrl: "https://github.com/mustafaBulut1/agents-diet/issues/7"
githubIssueIid: 7
repositoryProvider: github
---
# RQ-0008 - Offer an optional rewrite with a deterministic check

Some files have nothing to move, but the user may still want them shorter. Unrestricted rewriting is what lost rules before, so it must be optional and checked by code.

- At the end the skill asks whether to rewrite. Without an explicit yes nothing changes; an unattended run never rewrites.
- `agents-diet rewrite check`, `apply` and `discard` compare a candidate with the file section by section and reject one that loses a protected item.

## Acceptance Criteria

- The skill offers rewrite only after its report and only on an explicit yes.
- The check rejects a lost command, path, number, code block or prohibition.
- Normal mode is unchanged.
- `pnpm test` and `pnpm pack:check` pass.
