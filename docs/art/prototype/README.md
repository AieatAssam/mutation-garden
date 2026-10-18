# Look prototype

A throwaway three.js sketch that checks the palette and the Seed Packet look on a real renderer. It is not game code and must not be imported by the game.

It shows the island, the three starter plants, a Golden Sunny Sprout and a Crystal Bubble Berry, with the label UI on top.

## Re-render

Needs three (0.186 was used), the Fraunces and Atkinson Hyperlegible font files in `vendor/`, and Playwright with Chromium.

```
cd docs/art/prototype
mkdir -p vendor/three/examples
cp -r <node_modules>/three/build vendor/three/
cp -r <node_modules>/three/examples/jsm vendor/three/examples/
cp <fonts>/Fraunces-VariableFont_SOFT,WONK,opsz,wght.ttf vendor/Fraunces.ttf
cp <fonts>/AtkinsonHyperlegible-Regular.ttf vendor/Atkinson-Regular.ttf
cp <fonts>/AtkinsonHyperlegible-Bold.ttf vendor/Atkinson-Bold.ttf
ln -s <node_modules> node_modules   # must contain @playwright/test
node render.mjs
```

Query flags on `index.html`: `?dusk`, `?desktop`, `?bare` (hides the UI).

## Known gaps

- The rock underside's colour banding is rough, and the grass cap is a plain flat green. A real build needs tufts and baked AO.
- Crystal uses real transmission here. The style guide caps it at 3 objects on screen.
- Software WebGL (SwiftShader) rendered these shots, so they show no real-GPU differences.
