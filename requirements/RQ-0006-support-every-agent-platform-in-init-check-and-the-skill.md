---
id: RQ-0006
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Mustafa Bulut"
createdByEmail: "147878765+mustafaBulut1@users.noreply.github.com"
createdAt: "2026-11-23T15:28:01.948Z"
branch: "factory/RQ-0006"
createdFromCommit: "1b933b925a4fc69fbb1d85d84a820210b86fc2ea"
githubPullRequestUrl: "https://github.com/mustafaBulut1/agents-diet/pull/4"
githubPullRequestIid: 4
githubIssueUrl: "https://github.com/mustafaBulut1/agents-diet/issues/3"
githubIssueIid: 3
repositoryProvider: github
---
# RQ-0006 - Support every agent platform in init, check and the skill

Agents read different files. Codex reads `.agents/skills/`, not `.codex/skills/`; Claude Code reads `AGENTS.md` itself only when no `CLAUDE.md` exists; Gemini CLI reads `GEMINI.md`; Codex applies its 32 KiB limit to nested `AGENTS.md` files together.

- `init` installs the whole skill, references included, to `.agents/skills/` and `.claude/skills/`.
- `check` reports a missing `CLAUDE.md` as a warning, measures `GEMINI.md`, checks nested `AGENTS.md` files against the limit together, accepts a symlinked `CLAUDE.md`, and exits 1 on errors only.
- The skill names no single question tool, writes new skills to both locations and keeps `GEMINI.md` in step with `AGENTS.md`.

## Acceptance Criteria

- `init` writes both skill locations and nothing to `.codex/skills/`.
- Findings carry a severity; warnings alone exit 0.
- `GEMINI.md` and the combined `AGENTS.md` limit are reported.
- `pnpm test` and `pnpm pack:check` pass.
