# Examples: one decision each

Read this when a section is hard to place. Each example shows the text as found, the decision, and the result. The projects are made up for this file.

## Skill: a numbered procedure

Found in `CLAUDE.md`:

```markdown
## Releasing the mobile app

1. Bump `versionCode` in `android/app/build.gradle`.
2. Run `./gradlew bundleRelease` and wait for the signed bundle.
3. Upload `app-release.aab` to the internal testing track.
4. Post the build number in #mobile-release.
```

Decision: a procedure, needed only when releasing. It moves to a skill, word for word.

`.agents/skills/release-mobile/SKILL.md`, and the same file at `.claude/skills/release-mobile/SKILL.md`:

```markdown
---
name: release-mobile
description: Use when releasing the Android app to the internal testing track.
---

# Releasing the mobile app

1. Bump `versionCode` in `android/app/build.gradle`.
2. Run `./gradlew bundleRelease` and wait for the signed bundle.
3. Upload `app-release.aab` to the internal testing track.
4. Post the build number in #mobile-release.
```

Left in `CLAUDE.md`: `To release the mobile app, use the release-mobile skill.`

## Skill: a procedure told in prose

Found:

```markdown
## Rotating the API keys

Start by creating the new key in the provider console. Then add it to the secret store next to the old one, and redeploy the gateway so that it accepts both. Once traffic shows only the new key, delete the old one from the store.
```

Decision: no numbers, but a sequence of actions (start, then, once). It is a procedure: a skill, with the paragraph copied as it is. Do not turn it into numbered steps; that would be rewording.

## Docs: something to know, needed rarely

Found:

```markdown
## Legacy billing export

The nightly export writes `exports/billing-YYYYMMDD.csv` with the columns `account_id`, `plan`, `seats`, `amount_cents`. Finance reads it with a spreadsheet macro; the column order must not change. It runs on the old cron host, not in Kubernetes.
```

Decision: facts about a little-used job, not steps to perform, and needed only when touching that export. It moves to `docs/billing-export.md`, word for word.

Left in place: `Before changing the billing export, read docs/billing-export.md.`

## Subdirectory: rules for one directory

Found in the root `AGENTS.md`:

```markdown
In `web/`, components use the design tokens from `web/src/tokens.ts`; never write a colour value inline.
```

Decision: applies only under `web/`. It moves to `web/AGENTS.md`, and `web/CLAUDE.md` gets the line `@AGENTS.md`.

## Keep: needed in every session

Found:

```markdown
- Run `make test` before every commit.
- Never log customer email addresses.
```

Decision: every session needs both. They stay, word for word.

## Delete: history that no longer applies

Found:

```markdown
In 2022 we moved from Travis to GitHub Actions; the old `.travis.yml` was removed.
```

Decision: history; nothing in the project depends on it. Delete it and say why in the report. When a history paragraph also holds a fact that is still true ("the staging proxy still listens on 8443"), keep that sentence.

## Delete: enforced elsewhere

Found: `Indent with two spaces.` The project has `.editorconfig` with `indent_size = 2`, and CI runs the formatter.

Decision: the tool enforces it. Delete it and name `.editorconfig` and the CI step in the report.

## Dead reference: moved, not gone

Found: `` Read `scripts/seed.py` before changing fixtures. `` The checker says `scripts/seed.py` does not exist. A search finds `tools/scripts/seed.py`.

Decision: the file moved. Correct the path, change nothing else in the sentence.

## Dead reference: a false alarm

Found: `` The core module lives in `payments-core/`. `` The checker reports it dead. A search finds `services/payments-core/`, and the sentence lists modules by name.

Decision: the reference is live; it names the module, not a root path. Leave the sentence exactly as it is and mention the finding in the report.

## Contradiction

Found in two places: `Always squash commits before merging.` and `Never squash; we keep every commit for bisecting.`

Decision: do not pick one. Ask the user, or in an unattended run, leave both and report them under "Questions".

## Unclear rule

Found: `Do not touch the scheduler until Priya's migration is done.`

Decision: nothing in the project says who Priya is or whether the migration is done. Do not delete it and do not guess. Ask, or leave it and list it under "Questions".

## Global: not about this project

Found: `Answer in short paragraphs and lead with the result.`

Decision: a personal working style. Propose moving it to the global file of each agent the user works with (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`) and ask; never write there without permission.
