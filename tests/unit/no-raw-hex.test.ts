// ESLint rejects hex colours in TS. This test also covers CSS, HTML and any other text under src/.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HEX = /#[0-9a-fA-F]{3,8}\b|\b0x[0-9a-fA-F]{6}\b/;
const ALLOWED = new Set([path.normalize('src/render/palette.ts')]);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

describe('colour source of truth', () => {
  it('no raw hex colours outside src/render/palette.ts and tests', () => {
    const files = [...walk('src'), 'index.html'].filter(
      (f) => !ALLOWED.has(path.normalize(f)) && !f.endsWith('.test.ts') && !f.endsWith('.md'),
    );
    const offenders = files.filter((f) => HEX.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
