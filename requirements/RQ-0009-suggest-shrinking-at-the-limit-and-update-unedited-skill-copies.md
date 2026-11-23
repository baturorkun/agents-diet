---
id: RQ-0009
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Mustafa Bulut"
createdByEmail: "147878765+mustafaBulut1@users.noreply.github.com"
createdAt: "2026-11-23T15:33:11.595Z"
branch: "factory/RQ-0009"
createdFromCommit: "c436df04783405d6c976aca35cdfba1d7d0b72ce"
completedRunId: "20261123153332-RQ-0009"
completedBy: "Mustafa Bulut"
completedAt: "2026-11-23T15:34:27.929Z"
githubPullRequestUrl: "https://github.com/mustafaBulut1/agents-diet/pull/10"
githubPullRequestIid: 10
githubIssueUrl: "https://github.com/mustafaBulut1/agents-diet/issues/9"
githubIssueIid: 9
repositoryProvider: github
---
# RQ-0009 - Suggest shrinking at the limit and update unedited skill copies

A user learns that a file is over the limit only by running `check`, and `init` treated any older skill copy as edited, contrary to the README.

- `check --notify` prints one suggestion at the limit, is silent under it, always exits 0 and changes nothing. It never starts a shrink.
- `init` adds a session-start hook for the tools a project uses (Claude Code when none is found), keeps existing settings, and supports `--no-notify`, `--notify-for` and `--remove-notify`.
- `init` records a manifest of installed hashes: an unedited older copy is updated, an edited one is kept unless `--force`.

## Acceptance Criteria

- Over the limit prints one suggestion; under it prints nothing; both exit 0.
- A broken config never blocks a session or the skill install, and is not overwritten.
- An unedited older copy updates without `--force`; an edited copy is kept.
- `pnpm test` and `pnpm pack:check` pass.
