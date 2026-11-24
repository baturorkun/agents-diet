---
id: RQ-0005
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Mustafa Bulut"
createdByEmail: "147878765+mustafaBulut1@users.noreply.github.com"
createdAt: "2026-11-23T15:17:33.659Z"
branch: "factory/RQ-0005"
createdFromCommit: "c6bac5b3bc1b8305265149044c593da0cfc0bab1"
completedRunId: "20261123152130-RQ-0005"
completedBy: "Mustafa Bulut"
completedAt: "2026-11-23T15:26:05.505Z"
githubPullRequestUrl: "https://github.com/mustafaBulut1/agents-diet/pull/2"
githubPullRequestIid: 2
githubIssueUrl: "https://github.com/mustafaBulut1/agents-diet/issues/1"
githubIssueIid: 1
repositoryProvider: github
---
# RQ-0005 - Restructure the skill around verbatim moves

The shipped skill told the agent to rewrite what stays. In an evaluation on 22 examples, 13 runs lost rules, up to 116 on one project. Rules must stay as written, move word for word, or be removed for a stated reason.

- Put the limits first: never rewrite an existing file from scratch, never invent or reword a rule, never touch code, never write outside the project without permission, never copy a secret, never commit.
- Separate a skill (a procedure to do) from docs (knowledge needed rarely).
- Ask before changing anything: proposed skills in one multi-select question; unclear rules, contradictions and global blocks on their own.
- Add `references/examples.md` (worked decisions) and `references/anti-patterns.md` (failures seen in evaluation).

## Acceptance Criteria

- `skill/SKILL.md` runs limits, measure, fix, classify, ask, apply, report, in that order.
- The skill instructs moving text word for word and no longer tells the agent to rewrite what stays.
- Both reference files ship in the package and the skill points to them.
- `pnpm test` and `pnpm pack:check` pass.
