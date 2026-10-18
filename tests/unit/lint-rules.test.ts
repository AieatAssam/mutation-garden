// Proves the architecture and colour rules in eslint.config.js actually fire.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
async function errors(code: string, filePath: string): Promise<string[]> {
  const [r] = await eslint.lintText(code, { filePath });
  return (r?.messages ?? []).map((m) => m.ruleId ?? 'parse');
}

describe('lint rules', () => {
  it('src/sim may not import three', async () => {
    expect(await errors("import { Vector3 } from 'three';\nexport const v = new Vector3();\n", 'src/sim/x.ts')).toContain('no-restricted-imports');
  });
  it('src/sim may not import render or use Math.random', async () => {
    const e = await errors("import { palette } from '../render/palette';\nexport const r = Math.random() + Object.keys(palette).length;\n", 'src/sim/x.ts');
    expect(e).toContain('no-restricted-imports');
    expect(e).toContain('no-restricted-syntax');
  });
  it('raw hex colours are rejected outside the palette', async () => {
    expect(await errors("export const c = '#FF0000';\n", 'src/ui/x.ts')).toContain('no-restricted-syntax');
    expect(await errors('export const c = 0xff0000;\n', 'src/render/x.ts')).toContain('no-restricted-syntax');
  });
  it('the generated palette may contain hex', async () => {
    expect(await errors("export const c = '#FF0000';\n", 'src/render/palette.ts')).toEqual([]);
  });
  it('nothing imports src/lab before M4', async () => {
    expect(await errors("import '../lab/bench';\n", 'src/app/x.ts')).toContain('no-restricted-imports');
  });
});
