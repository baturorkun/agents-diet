import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** A project laid out from { path: content }, removed after body runs. */
export function withProject(files, body) {
  const root = mkdtempSync(join(tmpdir(), 'agents-diet-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A clean project: an AGENTS.md that Claude Code reads, naming files that exist. */
export const CLEAN = {
  'AGENTS.md': '# Rules\n\nBuild with `pnpm build`. Sources are in `src/index.ts`; see [the guide](docs/guide.md).\n',
  'CLAUDE.md': '# Claude Code\n\n@AGENTS.md\n',
  'src/index.ts': 'export {};\n',
  'docs/guide.md': '# Guide\n',
};
