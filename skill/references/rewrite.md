# Rewrite

Make the file shorter and easier to read without changing what an agent would do after reading it. Use your judgment.

## Keep

- The meaning of every rule.
- Prohibitions, requirements and exceptions: words such as `never`, `must`, `do not`, `cannot`, `unless`, `except`, `only if`, and their equivalents in the rule's language.
- Commands, code, paths, URLs, names and numbers, exactly as written.
- The number and order of procedure steps.
- Headings, `@import` lines and frontmatter.
- Security rules. Never print or copy a secret.
- The language of each rule.

## You are free to

- Reword, shorten or merge sentences.
- Remove filler, repetition and over-explanation.
- Turn long prose into a short list.

If nothing is worth changing, say so.

## Steps

1. Write the complete new version to `<name>.rewrite.md` beside the original (`CLAUDE.md` → `CLAUDE.rewrite.md`) with your file-writing tool. Do not change the original, and do not keep the draft only in memory.
2. Run `npx agents-diet rewrite preview <file> <name>.rewrite.md`. If it rejects a section, fix that section in the file and run it again.
3. Show the user the path and the preview, by section heading, never by number. Ask in the chat: **Approve**, **Cancel**, or write what should change. On a correction, update the file, run the preview again and ask again.
4. Approve: run `npx agents-diet rewrite apply <file> <name>.rewrite.md`. Cancel, or nothing to apply: run `npx agents-diet rewrite discard <name>.rewrite.md`.
5. When you finish, for any reason, make sure `<name>.rewrite.md` is gone. Do not ask before removing it. Leave the changes uncommitted. Without Git, `apply` keeps the original as `<file>.before-rewrite`; tell the user where it is.
