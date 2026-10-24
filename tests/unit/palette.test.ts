import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { generate } from '../../scripts/gen-palette.mjs';
import { palette } from '../../src/render/palette';

const json = JSON.parse(fs.readFileSync('docs/art/palette.json', 'utf8'));

describe('palette', () => {
  it('src/render/palette.ts matches docs/art/palette.json', () => {
    expect(fs.readFileSync('src/render/palette.ts', 'utf8')).toBe(generate(json));
  });

  it('has the groups the style guide requires', () => {
    for (const k of ['ink', 'environment', 'plants', 'mutations', 'ui', 'lighting']) expect(palette).toHaveProperty(k);
    expect(Object.keys(palette.plants).sort()).toEqual(['bubble-berry', 'puffcap', 'sunny-sprout', 'twistroot']);
    expect(Object.keys(palette.mutations).sort()).toEqual(['crystal', 'giant', 'glowing', 'golden', 'rainbow']);
  });
});
