// Generates src/render/palette.ts from docs/art/palette.json (the art source of truth).
// node scripts/gen-palette.mjs          write the file
// node scripts/gen-palette.mjs --check  exit 1 if the file is missing or out of date
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'docs/art/palette.json');
const out = path.join(root, 'src/render/palette.ts');

export function generate(json) {
  const body = JSON.stringify(json, null, 2);
  return `// GENERATED from docs/art/palette.json by scripts/gen-palette.mjs. Do not edit by hand.
// Change docs/art/palette.json, then run \`npm run palette\`.
// This is the only file in src/ allowed to contain hex colour literals.

export const palette = ${body} as const;

export type Palette = typeof palette;
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (isMain) {
  const want = generate(JSON.parse(fs.readFileSync(src, 'utf8')));
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (have !== want) {
      console.error('src/render/palette.ts is out of date with docs/art/palette.json. Run `npm run palette`.');
      process.exit(1);
    }
    console.log('palette.ts is up to date');
  } else {
    fs.writeFileSync(out, want);
    console.log('wrote src/render/palette.ts');
  }
}
