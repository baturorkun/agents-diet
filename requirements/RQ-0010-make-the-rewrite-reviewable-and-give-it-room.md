---
id: RQ-0010
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Mustafa Bulut"
createdByEmail: "147878765+mustafaBulut1@users.noreply.github.com"
createdAt: "2026-11-23T15:34:59.168Z"
branch: "factory/RQ-0010"
createdFromCommit: "86d51d7b6db7a5f2679a6f497c5b66ca2210b402"
githubPullRequestUrl: "https://github.com/mustafaBulut1/agents-diet/pull/12"
githubPullRequestIid: 12
githubIssueUrl: "https://github.com/mustafaBulut1/agents-diet/issues/11"
githubIssueIid: 11
repositoryProvider: github
---
# RQ-0010 - Make the rewrite reviewable and give it room

In trials the draft stayed in the model's memory, sections were offered by number, and the check was so strict that almost nothing was shortened.

- The model writes the complete new version to a visible `<name>.rewrite.md`. `rewrite preview` compares the two files by section heading and shows the changed lines.
- Approval is asked in the chat: approve, cancel, or write a correction, which is applied and asked again. The temporary file is always removed.
- The check keeps commands, code, paths, URLs, names, numbers, secrets, structure, procedure steps and prohibition or exception words. Size limits and counting of common words are removed.
- The version moves to 0.2.0.

The rewrite is experimental: on three projects it reduced files by 2-4% with no protected item lost.

## Acceptance Criteria

- The original changes only after approval.
- The preview names sections by heading, never by number.
- No `.rewrite.md` remains after the flow.
- `never`, `must`, `unless` and `except` cannot be lost.
- `package.json` and the skill carry version 0.2.0.
- `pnpm test` and `pnpm pack:check` pass.
