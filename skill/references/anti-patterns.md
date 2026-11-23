# Anti-patterns: mistakes seen in real runs

Read this before you finish and check your changes against it. Each one happened in a measured run of this skill (`skill-eval/DENEY-KAYDI.md`, run of `deney-0`); the projects are described, not quoted.

## 1. Summarising while moving or tidying

What happened: sections were merged into one block, module lists were cut to a line, and "Key Components" became one sentence. The report called it a cleanup. Dozens of rules disappeared, and many that stayed were reworded.

Why it is wrong: a summary loses the qualifiers and the details someone relied on. A reworded rule can change its meaning without anyone noticing.

Instead: move or keep text word for word. If something seems wordy, say so in the report and let the user decide.

## 2. "Fixing" references the checker misread

What happened: the checker reported 19 dead references in one file. All 19 existed: the file named modules by their short names, and they sat one directory deeper. The run rewrote every line to "correct" the paths.

Why it is wrong: the references were live, and nineteen correct lines were rewritten.

Instead: search for each name before acting. Only a reference you cannot find anywhere is dead.

## 3. Shortening a procedure while moving it

What happened: a five-step procedure was moved to a skill with steps merged and two of them shortened, in two different projects.

Why it is wrong: a step left out is a step someone will skip.

Instead: move the procedure whole: every step, in its order, word for word.

## 4. Missing a procedure written in prose

What happened: a release procedure written as a paragraph ("start by…, next…, once…, last…") stayed in the root file, while a numbered one in the same file became a skill.

Instead: a sequence of actions is a procedure whether or not it is numbered.

## 5. Leaving a broken skill as it was

What happened: a project skill had no `description` in its frontmatter. The run trimmed the instruction files and left the skill broken; without a description the skill never triggers.

Instead: check existing project skills too, and add the missing `name` or `description`.

## 6. Creating skills without asking

What happened: in an interactive session, the agent created a skill and edited the file without showing the proposals first.

Instead: propose, ask (a multi-select question, or a numbered list when that tool is missing), then change only what the user chose.

## 7. Leaving a confirmed dead reference

What happened: the checker reported `tests/integration/` and `tests/e2e/`; neither directory existed anywhere. The run left both sentences in place and did not mention them.

Instead: a reference you confirmed dead is corrected or removed, and the report says which.
