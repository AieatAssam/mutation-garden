// ESLint flat config. Two jobs beyond the usual:
// 1. Enforce module boundaries (docs/architecture.md). Gameplay state in src/sim is pure TypeScript.
// 2. Reject raw colour literals outside src/render/palette.ts (docs/art/style-guide.md).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const HEX = [
  {
    selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
    message: 'Raw hex colour. Use `palette` from src/render/palette.ts (generated from docs/art/palette.json).',
  },
  {
    selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
    message: 'Raw hex colour. Use `palette` from src/render/palette.ts (generated from docs/art/palette.json).',
  },
  {
    selector: 'Literal[raw=/^0x[0-9a-fA-F]{6}$/]',
    message: 'Raw 0xRRGGBB colour. Use `palette` from src/render/palette.ts.',
  },
];

// Determinism rules for the simulation: no ambient randomness or wall-clock time.
const SIM_DETERMINISM = [
  { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'src/sim must use the seeded RNG passed in, not Math.random().' },
  { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'src/sim must take time as an argument, not read Date.now().' },
  { selector: "NewExpression[callee.name='Date']", message: 'src/sim must take time as an argument, not construct Date.' },
  { selector: "MemberExpression[object.name='performance'][property.name='now']", message: 'src/sim must take time as an argument.' },
];

const mod = (name) => ({ regex: `(^|/)${name}(/|$)`, message: `Module boundary: see docs/architecture.md before importing ${name}.` });
const THREE = { regex: '^three($|/)', message: 'Only src/render and src/app may import three.' };
const RAPIER = { regex: '^@dimforge/', message: 'Only src/physics (and src/app for init) may import Rapier.' };
const LAB = { regex: '(^|/)lab(/|$)', message: 'The Mutation Laboratory is Milestone 4. Nothing imports src/lab before M4.' };

const boundary = (files, patterns) => ({ files, rules: { 'no-restricted-imports': ['error', { patterns }] } });

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'docs/art/prototype/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-restricted-syntax': ['error', ...HEX] },
  },
  // Gameplay state: pure, deterministic, no engine, no DOM.
  boundary(['src/sim/**'], [THREE, RAPIER, LAB, mod('render'), mod('physics'), mod('ui'), mod('input'), mod('audio'), mod('save'), mod('app')]),
  {
    files: ['src/sim/**'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-syntax': ['error', ...HEX, ...SIM_DETERMINISM],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'indexedDB', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'navigator'],
    },
  },
  boundary(['src/save/**'], [THREE, RAPIER, LAB, mod('render'), mod('physics'), mod('ui'), mod('input'), mod('audio'), mod('app')]),
  boundary(['src/physics/**'], [THREE, LAB, mod('render'), mod('ui'), mod('input'), mod('audio'), mod('save'), mod('app')]),
  boundary(['src/render/**'], [RAPIER, LAB, mod('physics'), mod('ui'), mod('input'), mod('audio'), mod('save'), mod('app')]),
  boundary(['src/ui/**'], [THREE, RAPIER, LAB, mod('render'), mod('physics'), mod('input'), mod('audio'), mod('save'), mod('app')]),
  boundary(['src/input/**'], [THREE, RAPIER, LAB, mod('render'), mod('physics'), mod('ui'), mod('audio'), mod('save'), mod('app')]),
  boundary(['src/audio/**'], [THREE, RAPIER, LAB, mod('render'), mod('physics'), mod('ui'), mod('input'), mod('save'), mod('app')]),
  boundary(['src/app/**'], [LAB]),
  // Colour literals are allowed only in the generated palette and in tests.
  {
    files: ['src/render/palette.ts', 'tests/**', '**/*.test.ts', 'scripts/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
