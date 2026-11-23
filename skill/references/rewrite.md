# Rewrite

Read this only after the user said yes in step 7. A rewrite removes words that carry no instruction. It must never change what an agent does after reading the file.

## Never change

- **Commands and code:** commands, flags, code blocks.
- **Identifiers:** file paths, URLs, environment variables, function names.
- **Numbers:** versions, limits, timeouts, dates.
- **Force of a rule:** `must`, `never`, `always`, `only`, `should`, and their equivalents in the rule's language.
- **Conditions and exceptions:** `if`, `unless`, `except`, `only when`.
- **Scope:** the directory, tool or language a rule applies to.
- **Order:** procedure steps, "first X, then Y".
- **Examples and reasons:** examples and "because…" clauses. They help an agent decide edge cases.
- **Sensitive items:** security rules, lines holding a secret, contradictory and unclear rules.
- **Structure:** headings, `@import` lines, frontmatter, pointers, and the language of the rule.

## May change

- Filler: "It is important to note that…", "Please make sure to…".
- A sentence that repeats the same thing in the same section.
- An introduction or transition that carries no rule.
- A long sentence, shortened without changing its meaning.

When in doubt, leave the sentence as it is.

## Steps

1. Copy the file to `.agents-diet-rewrite/<same path>` and edit only the copy. Do not add, remove, rename or reorder a heading.
2. Run `npx agents-diet rewrite check <file> <candidate>`. It compares each section and rejects one that lost a protected item, changed their order, shrank by more than 30%, or saves under 100 bytes. Restore a rejected section in the candidate, or fix it and check again. Never work around the check.
3. For each accepted section, show the user the text before and after, the bytes saved, and which new sentence carries each old rule. If a rule has no sentence, restore that section.
4. Ask which sections to apply, as one multi-select question (or a numbered list, then wait).
5. Run `npx agents-diet rewrite apply <file> <candidate> --sections <numbers>`. If the user chose none, run `npx agents-diet rewrite discard <candidate>`.
6. Run `npx agents-diet check --json` again. Report each section rewritten and the bytes saved. Leave the changes uncommitted: `git diff` shows and undoes them. Without Git, `apply` keeps the original beside the file as `<file>.before-rewrite`.
