---
id: RQ-0007
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Mustafa Bulut"
createdByEmail: "147878765+mustafaBulut1@users.noreply.github.com"
createdAt: "2026-11-23T15:29:38.096Z"
branch: "factory/RQ-0007"
createdFromCommit: "4debd88c9d068466438f4791aa8d72b4efc22f42"
completedRunId: "20261123152958-RQ-0007"
completedBy: "Mustafa Bulut"
completedAt: "2026-11-23T15:30:54.227Z"
githubPullRequestUrl: "https://github.com/mustafaBulut1/agents-diet/pull/6"
githubPullRequestIid: 6
githubIssueUrl: "https://github.com/mustafaBulut1/agents-diet/issues/5"
githubIssueIid: 5
repositoryProvider: github
---
# RQ-0007 - Add goal principles, resolve package paths, move new docs to agents-docs

The goal is rules that are loaded, found and followed, not a smaller file. `check` also reported live paths as dead when they were relative to a package (19 of 19 findings on one project), and new documents mixed with a project's own `docs/`, which may be a published site.

- The skill never presents size as the result, changes nothing on an audit, creates skills only for procedures, and shows text, target, basis and effect for each proposal.
- `check` resolves paths from the file, the root, a project-relative leading `/`, and a suffix search; a path found elsewhere is a `reference-elsewhere` warning.
- New documents go to `agents-docs/<topic>.md`, never to `docs/`.

## Acceptance Criteria

- A path that exists under a package is not a `dead-reference` error.
- Truly dead references are still reported.
- The skill and its examples write new documents to `agents-docs/`.
- `pnpm test` and `pnpm pack:check` pass.
