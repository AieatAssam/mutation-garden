import { devices, expect, test, type CDPSession, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Quaternion, Vector3 } from 'three';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from '../../src/render/camera';
import { getPlotStatusDialFacing } from '../../src/render/plot-status';
import { captureVisibleBodyMasks } from './production-body-mask';
import { palette } from '../../src/render/palette';
import { expectHarvestPaid } from './payout';
import { SPECIES } from '../../src/sim';

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type SpeciesId = (typeof SPECIES)[number]['id'];
const speciesPlot: Record<SpeciesId, number> = { 'sunny-sprout': 0, 'bubble-berry': 2, twistroot: 4 };
const speciesStampWorldY: Record<SpeciesId, number> = {
  // Authored plant tops (tools/blender/build_plants.py) plus the 0.45 stamp lift.
  'sunny-sprout': 2.89,
  'bubble-berry': 2.30,
  twistroot: 3.13,
};

const speciesLabels: Record<SpeciesId, string> = {
  'sunny-sprout': 'Sunny Sprout',
  'bubble-berry': 'Bubble Berry',
  twistroot: 'Twistroot',
};

function projectPlotPoint(
  rect: Box,
  plotId: number,
  worldY: number,
  camera?: ReturnType<typeof createGardenCamera>,
  worldXOffset = 0,
): Point {
  const viewCamera = camera ?? createGardenCamera();
  if (!camera) resizeGardenCamera(viewCamera, rect.width, rect.height);
  viewCamera.updateMatrixWorld(true);
  const x = (plotId % 2 === 0 ? -1.05 : 1.05) + worldXOffset;
  const z = [2, 0, -2][Math.floor(plotId / 2)]!;
  const projected = new Vector3(x, worldY, z).project(viewCamera);
  return { x: rect.x + (projected.x + 1) * rect.width / 2, y: rect.y + (1 - projected.y) * rect.height / 2 };
}

function plotCenters(rect: Box, worldY = 0.65, camera?: ReturnType<typeof createGardenCamera>): Point[] {
  return Array.from({ length: 6 }, (_, plotId) => projectPlotPoint(rect, plotId, worldY, camera));
}

function projectGround(rect: Box, z: number, camera?: ReturnType<typeof createGardenCamera>, worldX = 0): Point {
  const viewCamera = camera ?? createGardenCamera();
  if (!camera) resizeGardenCamera(viewCamera, rect.width, rect.height);
  viewCamera.updateMatrixWorld(true);
  const projected = new Vector3(worldX, 0.48, z).project(viewCamera);
  return {
    x: rect.x + (projected.x + 1) * rect.width / 2,
    y: rect.y + (1 - projected.y) * rect.height / 2,
  };
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

async function findEmptyGroundPair(
  page: Page,
  stage: Box,
  plots: readonly Point[],
  camera: ReturnType<typeof createGardenCamera>,
): Promise<[Point, Point]> {
  // These world points lie on the production ground ellipse; screen-space canvas
  // ownership alone also includes sky and cannot establish an eligible pinch.
  const worldPoints = [-3, -2.5, -2, -1, 0, 1, 2, 2.5, 3].flatMap((x) =>
    [-2.5, -2, -1, 0, 1, 2, 2.5].filter((z) => (x * x + z * z) < 3.3 ** 2).map((z) => ({ x, z })));
  const candidates = worldPoints.map(({ x, z }) => projectGround(stage, z, camera, x));
  const canvasOwned = await page.evaluate((points) => {
    const canvas = document.querySelector('#stage');
    return points.map(({ x, y }) => document.elementFromPoint(x, y) === canvas);
  }, candidates);
  const clearances = candidates.map((point) => Math.min(...plots.map((plot) => distance(point, plot))));
  const emptyGround = candidates.filter((point, index) => canvasOwned[index] && clearances[index]! > 48
    && point.x - 32 > stage.x && point.x + 32 < stage.x + stage.width
    && point.y - 32 > stage.y && point.y + 32 < stage.y + stage.height);
  const pairs: [Point, Point][] = [];
  for (const first of emptyGround) {
    for (const second of emptyGround) {
      const separation = distance(first, second);
      if (separation < 24) continue;
      const direction = { x: (second.x - first.x) / separation, y: (second.y - first.y) / separation };
      const outwardStart = { x: first.x - direction.x * 110, y: first.y - direction.y * 110 };
      const outwardEnd = { x: second.x + direction.x * 110, y: second.y + direction.y * 110 };
      if ([outwardStart, outwardEnd].some((point) => point.x < stage.x || point.x > stage.x + stage.width
        || point.y < stage.y || point.y > stage.y + stage.height)) continue;
      pairs.push([first, second]);
    }
  }
  pairs.sort((a, b) => distance(b[0], b[1]) - distance(a[0], a[1]));
  const pair = pairs[0];
  if (!pair) throw new Error(`Could not find ground pinch pair: ${JSON.stringify(candidates.map((point, index) => ({
    world: worldPoints[index], x: Math.round(point.x), y: Math.round(point.y),
    canvas: canvasOwned[index], clearance: Math.round(clearances[index]!),
  })))}`);
  return pair;
}

async function setViewport(page: Page, project: string): Promise<void> {
  await page.setViewportSize(project === 'desktop'
    ? { width: 1280, height: 800 }
    : { width: 390, height: 844 });
}

async function installGameClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let nowMs = Date.now();
    const browserDateNow = Date.now.bind(Date);
    nowMs = browserDateNow();
    Date.now = () => nowMs;
    Object.defineProperty(window, '__gardenTestClock', {
      configurable: false,
      value: { advance: (deltaMs: number) => { nowMs += deltaMs; } },
    });
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    let frozen = false;
    let deliveredFrames = 0;
    const held: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((timestamp) => {
      if (frozen) {
        held.push(callback);
        return;
      }
      deliveredFrames += 1;
      callback(timestamp);
    });
    Object.defineProperty(window, '__gardenTestFrames', {
      configurable: false,
      value: {
        freeze: () => { frozen = true; return deliveredFrames; },
        count: () => deliveredFrames,
        resume: () => {
          frozen = false;
          for (const callback of held.splice(0)) {
            nativeRequestAnimationFrame((timestamp) => { deliveredFrames += 1; callback(timestamp); });
          }
        },
      },
    });
  });
}

async function advanceGameClock(page: Page, deltaMs: number): Promise<void> {
  await page.evaluate((delta) => {
    (window as unknown as Window & { __gardenTestClock: { advance(deltaMs: number): void } })
      .__gardenTestClock.advance(delta);
  }, deltaMs);
}

async function freezeFrames(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Window & {
    __gardenTestFrames: { freeze(): number };
  }).__gardenTestFrames.freeze());
}

async function resumeFrames(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as Window & {
    __gardenTestFrames: { resume(): void };
  }).__gardenTestFrames.resume());
}

async function deliveredFrames(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as Window & {
    __gardenTestFrames: { count(): number };
  }).__gardenTestFrames.count());
}

async function realActivate(page: Page, point: Point, mobile: boolean): Promise<void> {
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function realSwipe(page: Page, points: readonly Point[], mobile: boolean, cancelled = false): Promise<void> {
  const [start, ...path] = points;
  if (!start) throw new Error('A production swipe needs a stamp start point');
  if (mobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ id: 1, x: start.x, y: start.y }],
    });
    for (const point of path) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ id: 1, x: point.x, y: point.y }],
      });
    }
    await session.send('Input.dispatchTouchEvent', {
      type: cancelled ? 'touchCancel' : 'touchEnd', touchPoints: [],
    });
    await session.detach();
    return;
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const point of path) await page.mouse.move(point.x, point.y, { steps: 5 });
  if (cancelled) await page.mouse.move(-2, -2, { steps: 5 });
  await page.mouse.up();
}

async function probeGroundByReversiblePan(
  page: Page,
  session: CDPSession,
  point: Point,
  pointerId: number,
): Promise<void> {
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds).not.toBeNull();
  const dx = point.x - 50 >= bounds!.x ? -50 : 50;
  // Compare whole-stage captures: a pan shifts most of the image; restoring leaves only ambient motion.
  const before = await stageCapture(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: pointerId, ...point }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: pointerId, x: point.x + dx, y: point.y }] });
  expect(await changedFraction(page, before, await stageCapture(page)),
    'a candidate ground contact pans the rendered camera synchronously').toBeGreaterThan(0.1);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: pointerId, x: point.x, y: point.y }] });
  expect(await changedFraction(page, before, await stageCapture(page)),
    'the reversible ground probe restores the camera before pinch').toBeLessThan(0.02);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
}

/**
 * Finds the settled stamp for a species: projected from the plant top plus the stamp lift, then
 * confirmed by colour inside that disc (fruit fill, paper ring and tick, ink rim), so the check
 * survives art changes to the plants (ADR 0009) but still fails when no stamp is drawn.
 */
async function readStamp(
  page: Page,
  speciesId: SpeciesId,
  camera?: ReturnType<typeof createGardenCamera>,
): Promise<{ center: Point; box: Box }> {
  const stageBounds = await page.locator('#stage').boundingBox();
  expect(stageBounds).not.toBeNull();
  const projectionCamera = camera ?? createGardenCamera();
  if (!camera) resizeGardenCamera(projectionCamera, stageBounds!.width, stageBounds!.height);
  const radius = 0.31 * stageBounds!.width * projectionCamera.zoom / (projectionCamera.right - projectionCamera.left);
  expect(radius * 2, `${speciesLabels[speciesId]} projected stamp must be at least 26px wide`).toBeGreaterThanOrEqual(26);
  // Yield size scales the plant, so search up its axis around the regular stamp height.
  const base = speciesStampWorldY[speciesId];
  const candidates = Array.from({ length: 15 }, (_, index) => base - 0.5 + index * 0.1)
    .map((worldY) => projectPlotPoint(stageBounds!, speciesPlot[speciesId], worldY, camera));
  const xs = candidates.map(({ x }) => x);
  const ys = candidates.map(({ y }) => y);
  const clip = {
    x: Math.max(stageBounds!.x, Math.min(...xs) - radius * 1.4),
    y: Math.max(stageBounds!.y, Math.min(...ys) - radius * 1.4),
    width: 0,
    height: 0,
  };
  clip.width = Math.min(stageBounds!.x + stageBounds!.width, Math.max(...xs) + radius * 1.4) - clip.x;
  clip.height = Math.min(stageBounds!.y + stageBounds!.height, Math.max(...ys) + radius * 1.4) - clip.y;
  const image = (await page.screenshot({ clip, scale: 'css' })).toString('base64');
  const results = await page.evaluate(async ({ encoded, fruit, paper, ink, centers, radius: discRadius }) => {
    const picture = new Image();
    picture.src = `data:image/png;base64,${encoded}`;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(picture, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const targets = { fruit: rgb(fruit), paper: rgb(paper), ink: rgb(ink) };
    return centers.map(({ x: cx, y: cy }) => {
      const counts = { fruit: 0, paper: 0, ink: 0 };
      let total = 0;
      for (let y = Math.max(0, Math.floor(cy - discRadius)); y < Math.min(height, Math.ceil(cy + discRadius)); y += 1) {
        for (let x = Math.max(0, Math.floor(cx - discRadius)); x < Math.min(width, Math.ceil(cx + discRadius)); x += 1) {
          if (Math.hypot(x - cx, y - cy) > discRadius) continue;
          total += 1;
          const offset = (y * width + x) * 4;
          for (const key of ['fruit', 'paper', 'ink'] as const) {
            const [r, g, b] = targets[key];
            if (Math.abs(data[offset]! - r!) + Math.abs(data[offset + 1]! - g!) + Math.abs(data[offset + 2]! - b!) < 45) {
              counts[key] += 1;
            }
          }
        }
      }
      return total === 0 ? { fruit: 0, paper: 0, ink: 0 }
        : { fruit: counts.fruit / total, paper: counts.paper / total, ink: counts.ink / total };
    });
  }, {
    encoded: image, fruit: palette.plants[speciesId].fruit[1], paper: palette.ink['paper-white'], ink: palette.ink['press-ink'],
    centers: candidates.map(({ x, y }) => ({ x: x - clip.x, y: y - clip.y })), radius: radius * 1.4,
  });
  const visible = results
    .map((fractions, index) => ({ fractions, center: candidates[index]! }))
    .filter(({ fractions }) => fractions.paper >= 0.05 && fractions.fruit >= 0.1 && fractions.ink >= 0.03)
    .sort((a, b) => b.fractions.paper - a.fractions.paper)[0];
  if (!visible) {
    throw new Error(`settled ${speciesLabels[speciesId]} stamp should be visible above plot ${speciesPlot[speciesId]}: ${JSON.stringify(results)}`);
  }
  const center = visible.center;
  return { center, box: { x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2 } };
}

async function countFruitRampPixels(page: Page, speciesId: SpeciesId, centers: readonly Point[]): Promise<number[]> {
  const stage = await page.locator('#stage').boundingBox();
  expect(stage).not.toBeNull();
  const screenshot = await page.screenshot({ clip: stage!, scale: 'css' });
  return page.evaluate(async ({ encoded, colors, centers }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not inspect the production fruit crop');
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const targets = colors.map((color) => [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)));
    const size = 48;
    return centers.map(({ x: centerX, y: centerY }) => {
      const left = Math.max(0, Math.min(width - size, Math.floor(centerX - size / 2)));
      const top = Math.max(0, Math.min(height - size, Math.floor(centerY - size / 2)));
      let matching = 0;
      for (let y = top; y < Math.min(height, top + size); y += 1) {
        for (let x = left; x < Math.min(width, left + size); x += 1) {
          const pixel = (y * width + x) * 4;
          if (targets.some((target) => Math.max(
            Math.abs(data[pixel]! - target[0]!),
            Math.abs(data[pixel + 1]! - target[1]!),
            Math.abs(data[pixel + 2]! - target[2]!),
          ) <= 24)) matching += 1;
        }
      }
      return matching;
    });
  }, {
    encoded: screenshot.toString('base64'),
    colors: palette.plants[speciesId].fruit.slice(1),
    centers: centers.map(({ x, y }) => ({ x: x - stage!.x, y: y - stage!.y })),
  });
}

async function capturePlantCrop(page: Page, stage: Box, plotId: number, worldY = 1.65): Promise<{ image: Buffer; bounds: Box }> {
  const center = projectPlotPoint(stage, plotId, worldY);
  const x = Math.round(center.x - 60);
  const y = Math.round(center.y - 60);
  expect(x, '120px plant crop stays inside the production canvas horizontally').toBeGreaterThanOrEqual(stage.x);
  expect(x + 120).toBeLessThanOrEqual(stage.x + stage.width);
  expect(y, '120px plant crop stays inside the production canvas vertically').toBeGreaterThanOrEqual(stage.y);
  expect(y + 120).toBeLessThanOrEqual(stage.y + stage.height);
  return {
    image: await page.screenshot({ clip: { x, y, width: 120, height: 120 }, scale: 'css' }),
    bounds: { x, y, width: 120, height: 120 },
  };
}

function projectWorldPoint(point: Vector3, camera: ReturnType<typeof createGardenCamera>, stage: Box): Point {
  const projected = point.clone().project(camera);
  return { x: stage.x + (projected.x + 1) * stage.width / 2, y: stage.y + (1 - projected.y) * stage.height / 2 };
}

function circlePolygon(center: Vector3, radius: number, facing: Quaternion, camera: ReturnType<typeof createGardenCamera>, stage: Box): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI * 2 / 24;
    const local = new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(facing);
    points.push(projectWorldPoint(center.clone().add(local), camera, stage));
  }
  return points;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length > 1 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point[] = [];
  for (const point of sorted.reverse()) {
    while (upper.length > 1 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function projectDialPolygons(plotId: number, stage: Box, crop: Box): Point[][] {
  const camera = createGardenCamera();
  resizeGardenCamera(camera, stage.width, stage.height);
  camera.updateMatrixWorld(true);
  const facing = getPlotStatusDialFacing(camera.quaternion);
  const up = new Vector3(0, 1, 0).applyQuaternion(facing);
  const plotX = plotId % 2 === 0 ? -1.05 : 1.05;
  const plotZ = [2, 0, -2][Math.floor(plotId / 2)]!;
  const foot = new Vector3(plotX - 0.30 - 0.20 * up.x, 0.70, plotZ + 0.80);
  const center = foot.clone().add(new Vector3(0, 0.12, 0)).addScaledVector(up, 0.20);
  const toCrop = (point: Point): Point => ({ x: point.x - crop.x, y: point.y - crop.y });
  const face = circlePolygon(center, 0.20, facing, camera, stage).map(toCrop);
  const peg: Point[] = [];
  for (const y of [0, 0.12]) for (let index = 0; index < 16; index += 1) {
    const angle = index * Math.PI * 2 / 16;
    const world = foot.clone().add(new Vector3(Math.cos(angle) * 0.035, y, Math.sin(angle) * 0.035));
    peg.push(toCrop(projectWorldPoint(world, camera, stage)));
  }
  return [face, convexHull(peg)];
}

async function comparePlantBodyPixels(
  page: Page,
  baseline: Buffer,
  mature: Buffer,
  harvestable: Buffer,
  stampBox: Box,
  bodyMasks: { mature: Uint8Array; harvestable: Uint8Array },
  masks: { polygons: Point[][] },
): Promise<{
  bodyPixels: number;
  changedBodyPixels: number;
  ratio: number;
  cropPixels: number;
  changedCropPixels: number;
  cropRatio: number;
  diagnostics: string;
}> {
  const encoded = [baseline, mature, harvestable].map((image) => image.toString('base64'));
  return page.evaluate(async ({ captures, stampBox, bodyMasks, masks }) => {
    const pointInPolygon = (point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const a = polygon[i]!;
        const b = polygon[j]!;
        if ((a.y > point.y) !== (b.y > point.y)
          && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    const images = await Promise.all(captures.map(async (source) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Could not inspect the 120px production crop');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, 120, 120).data;
    }));
    const [, maturePixels, ready] = images as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
    let bodyPixels = 0;
    let changedBodyPixels = 0;
    let cropPixels = 0;
    let changedCropPixels = 0;
    const union = new Uint8Array(120 * 120);
    const changed = new Uint8Array(120 * 120);
    const excluded = new Uint8Array(120 * 120);
    for (let y = 0; y < 120; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        const stamp = stampBox;
        const inStamp = x >= stamp.x - 3 && x < stamp.x + stamp.width + 3
          && y >= stamp.y - 3 && y < stamp.y + stamp.height + 3;
        const point = { x: x + 0.5, y: y + 0.5 };
        const inDial = masks.polygons.some((polygon) => pointInPolygon(point, polygon));
        const inExclusion = inStamp || inDial;
        const pixel = y * 120 + x;
        if (inExclusion) excluded[pixel] = 1;
        if (!inStamp && !inDial) cropPixels += 1;
        const offset = (y * 120 + x) * 4;
        const changedPixel = Math.max(
          Math.abs(maturePixels[offset]! - ready[offset]!),
          Math.abs(maturePixels[offset + 1]! - ready[offset + 1]!),
          Math.abs(maturePixels[offset + 2]! - ready[offset + 2]!),
        ) > 20;
        if (!inStamp && !inDial && changedPixel) changedCropPixels += 1;
        if (!bodyMasks.mature[pixel] && !bodyMasks.harvestable[pixel]) continue;
        if (inStamp || inDial) continue;
        union[pixel] = 1;
        bodyPixels += 1;
        if (changedPixel) { changedBodyPixels += 1; changed[pixel] = 1; }
      }
    }
    const diagnostics = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 120;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create pixel mask diagnostic');
      const output = context.createImageData(360, 120);
      for (const [panel, mode] of ['union', 'change', 'masks'].entries()) for (let y = 0; y < 120; y += 1) for (let x = 0; x < 120; x += 1) {
        const source = (y * 120 + x) * 4;
        const target = (y * 360 + x + panel * 120) * 4;
        output.data[target] = ready[source]!;
        output.data[target + 1] = ready[source + 1]!;
        output.data[target + 2] = ready[source + 2]!;
        output.data[target + 3] = 255;
        const set = (offset: number, r: number, g: number, b: number) => {
          output.data[offset] = r; output.data[offset + 1] = g; output.data[offset + 2] = b; output.data[offset + 3] = 220;
        };
        if (mode === 'union' && union[y * 120 + x]) set(target, 30, 235, 80);
        if (mode === 'change' && union[y * 120 + x]) set(target, 135, 135, 135);
        if (mode === 'change' && changed[y * 120 + x]) set(target, 255, 20, 190);
        if (mode === 'masks' && excluded[y * 120 + x]) set(target, 255, 190, 20);
      }
      context.putImageData(output, 0, 0);
      return canvas.toDataURL('image/png');
    })();
    return {
      bodyPixels,
      changedBodyPixels,
      ratio: bodyPixels ? changedBodyPixels / bodyPixels : 0,
      cropPixels,
      changedCropPixels,
      cropRatio: cropPixels ? changedCropPixels / cropPixels : 0,
      diagnostics,
    };
  }, { captures: encoded, stampBox, bodyMasks, masks });
}

async function plant(page: Page, speciesId: SpeciesId, plot: Point, mobile: boolean): Promise<void> {
  const seed = page.getByRole('navigation', { name: 'Seeds' })
    .getByRole('button', { name: speciesLabels[speciesId] });
  if (mobile) await seed.tap();
  else await seed.click();
  await expect(seed).toHaveAttribute('aria-pressed', 'true');
  await realActivate(page, plot, mobile);
}

async function openGame(page: Page, project: string): Promise<{ mobile: boolean; plots: Point[] }> {
  const mobile = project === 'mobile-portrait';
  await setViewport(page, project);
  await installGameClock(page);
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-boot', 'webgl');
  await expect(page.locator('body')).toHaveAttribute('data-models', 'ready');
  const stage = page.locator('#stage');
  await expect(stage).toBeVisible();
  const bounds = await stage.boundingBox();
  expect(bounds).not.toBeNull();
  return { mobile, plots: plotCenters(bounds!) };
}

async function waitForCoins(page: Page, amount: number): Promise<void> {
  await expect(page.getByRole('status', { name: 'Coins' })).toHaveText(String(amount));
}

async function settlePresentation(page: Page): Promise<void> {
  const began = await page.evaluate(() => performance.now());
  await expect.poll(() => page.evaluate(() => performance.now()), {
    intervals: [50, 100], timeout: 2_000,
  }).toBeGreaterThan(began + 320);
}

async function waitForRenderedStamps(
  page: Page,
  speciesIds: readonly SpeciesId[],
  camera?: ReturnType<typeof createGardenCamera>,
): Promise<Record<SpeciesId, { center: Point; box: Box }>> {
  const stamps = {} as Record<SpeciesId, { center: Point; box: Box }>;
  for (const speciesId of speciesIds) {
    let lastFailure = 'no stamp scan has run';
    await expect.poll(async () => {
      try {
        const stamp = await readStamp(page, speciesId, camera);
        if (stamp.box.width < 26 || stamp.box.height < 26) return 'stamp below minimum size';
        stamps[speciesId] = stamp;
        return 'ready';
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
        return lastFailure;
      }
    }, { intervals: [250, 500], timeout: 20_000 }).toBe('ready');
  }
  return stamps;
}

async function waitForStableStageBounds(page: Page): Promise<Box> {
  let previous: Box | null = null;
  let stableReads = 0;
  await expect.poll(async () => {
    const current = await page.locator('#stage').boundingBox();
    if (current && previous && ['x', 'y', 'width', 'height'].every((key) =>
      Math.abs(current[key as keyof Box] - previous![key as keyof Box]) < 0.5)) stableReads += 1;
    else stableReads = 0;
    previous = current;
    return stableReads >= 2;
  }, { intervals: [16, 32, 50], timeout: 2_000 }).toBe(true);
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function waitForSimulationOpportunity(page: Page): Promise<void> {
  const frameBaseline = await deliveredFrames(page);
  await settlePresentation(page);
  await expect.poll(() => deliveredFrames(page), { intervals: [16, 32, 50], timeout: 1_500 })
    .toBeGreaterThan(frameBaseline);
}

async function stageCapture(page: Page): Promise<string> {
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds).not.toBeNull();
  return (await page.screenshot({ clip: bounds!, scale: 'css' })).toString('base64');
}

/** Fraction of pixels whose colour moved by more than 24 in any channel between two stage captures. */
async function changedFraction(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(async ([first, second]) => {
    const read = async (encoded: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [x, y] = await Promise.all([read(first), read(second)]);
    let changed = 0;
    for (let index = 0; index < x.length; index += 4) {
      if (Math.max(Math.abs(x[index]! - y[index]!), Math.abs(x[index + 1]! - y[index + 1]!),
        Math.abs(x[index + 2]! - y[index + 2]!)) > 24) changed += 1;
    }
    return changed / (x.length / 4);
  }, [a, b] as const);
}

async function stageSignature(page: Page): Promise<string> {
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds).not.toBeNull();
  const image = await page.screenshot({ clip: bounds!, scale: 'css', type: 'jpeg', quality: 30 });
  return createHash('sha256').update(image).digest('hex');
}

async function attachGardenCapture(page: Page, info: { attach(name: string, options: { body: Buffer; contentType: string }): Promise<void> }, name: string, grayscale = false): Promise<void> {
  const canvas = page.locator('#stage');
  if (grayscale) await canvas.evaluate((element) => { (element as HTMLCanvasElement).style.filter = 'grayscale(1)'; });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const image = await page.screenshot({ clip: bounds!, scale: 'css' });
  await info.attach(name, { body: image, contentType: 'image/png' });
  if (grayscale) await canvas.evaluate((element) => { (element as HTMLCanvasElement).style.filter = ''; });
}

test('production status stamps stay visible and harvest their owning species', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { mobile, plots } = await openGame(page, info.project.name);
  await attachGardenCapture(page, info, `${info.project.name}-before-planting.png`);
  const viewport = page.viewportSize()!;
  const seeds = page.getByRole('navigation', { name: 'Seeds' });
  const tray = await seeds.boundingBox();
  expect(tray).not.toBeNull();
  await waitForCoins(page, 12);
  await expect(readStamp(page, 'sunny-sprout'))
    .rejects.toThrow('settled Sunny Sprout stamp should be visible');

  await plant(page, 'sunny-sprout', plots[0]!, mobile);
  await plant(page, 'bubble-berry', plots[2]!, mobile);
  await plant(page, 'twistroot', plots[4]!, mobile);
  await waitForCoins(page, 3);
  await advanceGameClock(page, 25_100);
  await attachGardenCapture(page, info, `${info.project.name}-ripe-before-stamp-check.png`);
  const renderedStamps = await waitForRenderedStamps(page, ['sunny-sprout', 'bubble-berry', 'twistroot']);
  const matureTwistroot = renderedStamps.twistroot;
  expect(matureTwistroot.box.width).toBeGreaterThanOrEqual(26);
  expect(matureTwistroot.box.height).toBeGreaterThanOrEqual(26);

  await attachGardenCapture(page, info, `${info.project.name}-ripe-before-harvest.png`);

  for (const speciesId of ['sunny-sprout', 'bubble-berry', 'twistroot'] as const) {
    const stamp = renderedStamps[speciesId];
    expect(stamp.box.width, `${speciesId} stamp width`).toBeGreaterThanOrEqual(26);
    expect(stamp.box.height, `${speciesId} stamp height`).toBeGreaterThanOrEqual(26);
    expect(stamp.box.x).toBeGreaterThanOrEqual(0);
    expect(stamp.box.y).toBeGreaterThanOrEqual(0);
    expect(stamp.box.x + stamp.box.width).toBeLessThanOrEqual(viewport.width);
    expect(stamp.box.y + stamp.box.height).toBeLessThanOrEqual(viewport.height);
    expect(stamp.box.y + stamp.box.height).toBeLessThan(tray!.y);

    await expectHarvestPaid(page, () => realActivate(page, stamp.center, mobile));
  }
  await attachGardenCapture(page, info, `${info.project.name}-after-harvest.png`);
  expect(errors).toEqual([]);
});

test('production stamp swipe cancellation and immediate repeat pay once without panning', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { mobile, plots } = await openGame(page, info.project.name);
  await attachGardenCapture(page, info, `${info.project.name}-before-planting.png`);
  await waitForCoins(page, 12);
  await plant(page, 'sunny-sprout', plots[0]!, mobile);
  await plant(page, 'bubble-berry', plots[2]!, mobile);
  await plant(page, 'twistroot', plots[4]!, mobile);
  await waitForCoins(page, 3);
  await advanceGameClock(page, 25_100);
  await attachGardenCapture(page, info, `${info.project.name}-camera-ripe-before-stamp-check.png`);
  const renderedStamps = await waitForRenderedStamps(page, ['sunny-sprout', 'bubble-berry', 'twistroot']);
  const stamps = (['sunny-sprout', 'bubble-berry', 'twistroot'] as const).map((speciesId) => renderedStamps[speciesId]);
  const emptyTrailingPlot = plots[5]!;
  const gesture = [stamps[0]!.center, stamps[1]!.center, stamps[2]!.center, stamps[1]!.center, emptyTrailingPlot];
  let frames = await freezeFrames(page);
  const beforeCancel = await stageSignature(page);
  await realSwipe(page, gesture, mobile, true);
  expect(await deliveredFrames(page)).toBe(frames);
  expect(await stageSignature(page), 'cancelled stamp swipe leaves the camera and garden unchanged while frames are frozen')
    .toBe(beforeCancel);
  await resumeFrames(page);
  await waitForSimulationOpportunity(page);
  await waitForCoins(page, 3);

  frames = await freezeFrames(page);
  const beforeRepeat = await stageSignature(page);
  const harvest = await expectHarvestPaid(page, async () => {
    await realSwipe(page, gesture, mobile);
    await realSwipe(page, gesture, mobile);
    expect(await deliveredFrames(page)).toBe(frames);
    expect(await stageSignature(page), 'both repeated stamp-start swipes leave the garden and camera unchanged while frames are frozen')
      .toBe(beforeRepeat);
    await resumeFrames(page);
  });
  await waitForSimulationOpportunity(page);
  await waitForCoins(page, harvest.after);
});

test('production camera pan, zoom and resize keep fresh fruit picks playable', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { mobile, plots } = await openGame(page, info.project.name);
  await attachGardenCapture(page, info, `${info.project.name}-camera-before-planting.png`);
  await waitForCoins(page, 12);
  await plant(page, 'sunny-sprout', plots[0]!, mobile);
  await plant(page, 'bubble-berry', plots[2]!, mobile);
  await plant(page, 'twistroot', plots[4]!, mobile);
  await waitForCoins(page, 3);
  await advanceGameClock(page, 25_100);
  await attachGardenCapture(page, info, `${info.project.name}-camera-ripe-before-stamp-check.png`);
  await waitForRenderedStamps(page, ['sunny-sprout', 'bubble-berry', 'twistroot']);
  const twistrootStampBeforePan = await readStamp(page, 'twistroot');
  expect(twistrootStampBeforePan.box.width).toBeGreaterThanOrEqual(26);

  // Freeze delivered app frames so each real tap tests the camera transform before reconciliation.
  const stage = page.locator('#stage');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const camera = createGardenCamera();
  resizeGardenCamera(camera, stageBox!.width, stageBox!.height);
  const panOrigin = projectGround(stageBox!, 0, camera, mobile ? -3 : -2.5);
  const plotsBeforePan = plotCenters(stageBox!, 0.65, camera);
  expect(Math.min(...plotsBeforePan.map((plot) => distance(panOrigin, plot))), 'camera pan begins on grass away from every plot')
    .toBeGreaterThan(48);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector('#stage'), panOrigin))
    .toBe(true);
  const panDrag = mobile ? { x: 45, y: 12 } : {
    x: Math.max(-60, Math.min(60, stageBox!.x + stageBox!.width / 2 - panOrigin.x)),
    y: Math.max(-60, Math.min(60, stageBox!.y + stageBox!.height / 2 - panOrigin.y)),
  };
  const panDistance = Math.hypot(panDrag.x, panDrag.y);
  const panDelta = { x: panDrag.x * (panDistance - 10) / panDistance, y: panDrag.y * (panDistance - 10) / panDistance };
  panGardenCamera(camera, panDelta.x, panDelta.y, stageBox!.width, stageBox!.height);
  let frames = await freezeFrames(page);
  const cameraBeforePan = await stageSignature(page);
  const session = mobile ? await page.context().newCDPSession(page) : null;
  if (mobile) {
    await session!.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...panOrigin }] });
    await session!.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: panOrigin.x + panDrag.x, y: panOrigin.y + panDrag.y }] });
    await session!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(panOrigin.x, panOrigin.y);
    await page.mouse.down();
    await page.mouse.move(panOrigin.x + panDrag.x, panOrigin.y + panDrag.y, { steps: 4 });
    await page.mouse.up();
  }
  await waitForCoins(page, 3);
  expect(await stageSignature(page), 'empty-ground pan changes the rendered camera while app frames are frozen')
    .not.toBe(cameraBeforePan);
  const stampAfterPan = await readStamp(page, 'sunny-sprout', camera);
  await expectHarvestPaid(page, async () => {
    await realActivate(page, stampAfterPan.center, mobile);
    expect(await deliveredFrames(page)).toBe(frames);
    await resumeFrames(page);
  });
  frames = await freezeFrames(page);
  const stageBoundsForZoom = await stage.boundingBox();
  expect(stageBoundsForZoom).not.toBeNull();
  const plotsAfterPan = plotCenters(stageBoundsForZoom!, 0.65, camera);
  const groundPair = await findEmptyGroundPair(page, stageBoundsForZoom!, plotsAfterPan, camera);
  for (const ground of groundPair) {
    expect(Math.min(...plotsAfterPan.map((plot) => distance(ground, plot))), 'pinch contacts begin on empty ground away from every plot')
      .toBeGreaterThan(48);
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y) === document.querySelector('#stage'), ground))
      .toBe(true);
  }
  const stampForZoom = await readStamp(page, 'bubble-berry', camera);
  if (mobile) {
    await probeGroundByReversiblePan(page, session!, groundPair[0], 7);
    await probeGroundByReversiblePan(page, session!, groundPair[1], 8);
  }
  const cameraBeforeZoom = await stageSignature(page);
  if (mobile) {
    const initialDistance = distance(groundPair[0], groundPair[1]);
    const finalDistance = initialDistance + 220;
    zoomGardenCamera(camera, finalDistance / (initialDistance + 10));
    const direction = { x: (groundPair[1].x - groundPair[0].x) / initialDistance,
      y: (groundPair[1].y - groundPair[0].y) / initialDistance };
    await session!.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...groundPair[0] }] });
    await session!.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, ...groundPair[0] }, { id: 2, ...groundPair[1] },
    ] });
    await session!.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { id: 1, x: groundPair[0].x - direction.x * 110, y: groundPair[0].y - direction.y * 110 },
      { id: 2, x: groundPair[1].x + direction.x * 110, y: groundPair[1].y + direction.y * 110 },
    ] });
    await session!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(groundPair[0].x, groundPair[0].y);
    await page.mouse.wheel(0, -200);
    zoomGardenCamera(camera, Math.exp(0.2));
  }
  const cameraAfterZoom = await stageSignature(page);
  expect(cameraAfterZoom, 'empty-ground zoom changes the rendered camera while app frames are frozen')
    .not.toBe(cameraBeforeZoom);
  const stampAfterZoom = await readStamp(page, 'bubble-berry', camera);
  expect(stampAfterZoom.box.width,
    `fresh zoomed Bubble Berry stamp remains visible; contacts=${JSON.stringify(groundPair)}, plots=${JSON.stringify(plotsAfterPan)}, stamps=${JSON.stringify([twistrootStampBeforePan.center, stampAfterPan.center, stampForZoom.center, stampAfterZoom.center])}`)
    .toBeGreaterThanOrEqual(26);
  await expectHarvestPaid(page, async () => {
    await realActivate(page, stampAfterZoom.center, mobile);
    expect(await deliveredFrames(page)).toBe(frames);
    await resumeFrames(page);
  });
  frames = await freezeFrames(page);
  await page.setViewportSize(mobile ? { width: 412, height: 915 } : { width: 1024, height: 768 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const resizedStageBounds = await waitForStableStageBounds(page);
  resizeGardenCamera(camera, resizedStageBounds.width, resizedStageBounds.height);
  const stampAfterResize = await readStamp(page, 'twistroot', camera);
  await page.evaluate(() => {
    const body = document.body as HTMLBodyElement & { dataset: DOMStringMap };
    const canvas = document.querySelector('#stage')!;
    canvas.addEventListener('pointerdown', () => {
      body.dataset.pointerDownAtFrame = String((window as unknown as Window & {
        __gardenTestFrames: { count(): number };
      }).__gardenTestFrames.count());
    }, { once: true, capture: true });
  });
  await expectHarvestPaid(page, async () => {
    await realActivate(page, stampAfterResize.center, mobile);
    expect(await deliveredFrames(page)).toBe(frames);
    expect(Number(await page.locator('body').getAttribute('data-pointer-down-at-frame'))).toBe(frames);
    await resumeFrames(page);
  });
  await session?.detach();
  expect(errors).toEqual([]);
});

test('six ripe plants stay under the production renderer draw-call budget', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const prototype = WebGL2RenderingContext.prototype;
    const windowWithCalls = window as unknown as Window & { __drawCalls: number };
    windowWithCalls.__drawCalls = 0;
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const) {
      const original = prototype[method] as (...args: number[]) => void;
      (prototype as unknown as Record<string, (...args: number[]) => void>)[method] = function (this: WebGL2RenderingContext, ...args: number[]) {
        windowWithCalls.__drawCalls += 1;
        return original.apply(this, args);
      };
    }
  });
  const { mobile, plots } = await openGame(page, info.project.name);
  await attachGardenCapture(page, info, `${info.project.name}-before-planting.png`);
  for (const plot of plots) await plant(page, 'sunny-sprout', plot, mobile);
  await waitForCoins(page, 6);
  await advanceGameClock(page, 8_100);
  await waitForRenderedStamps(page, ['sunny-sprout']);
  expect((await readStamp(page, 'sunny-sprout')).box.width).toBeGreaterThanOrEqual(26);
  const stageBounds = await page.locator('#stage').boundingBox();
  expect(stageBounds).not.toBeNull();
  const fruitCenters = plotCenters(stageBounds!, 1.81);
  const fruitPixelCounts = await countFruitRampPixels(page, 'sunny-sprout', fruitCenters);
  for (const [index, matchingPixels] of fruitPixelCounts.entries()) {
    expect(matchingPixels, `ripe Sunny Sprout fruit is visible at plot ${index}`).toBeGreaterThan(12);
  }
  if (info.project.name === 'mobile-portrait') {
    await attachGardenCapture(page, info, 'mobile-six-ripe-grayscale.png', true);
  }
  await attachGardenCapture(page, info, `${info.project.name}-six-ripe.png`);
  const calls = await page.evaluate(() => new Promise<number>((resolve) => {
    const windowWithCalls = window as unknown as Window & { __drawCalls: number };
    requestAnimationFrame(() => {
      windowWithCalls.__drawCalls = 0;
      requestAnimationFrame(() => resolve(windowWithCalls.__drawCalls));
    });
  }));
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThan(150);
});

test('production plant bodies differ between Mature 0.95 and Harvestable', async ({ browser }, info) => {
  test.setTimeout(360_000);
  const mobile = info.project.name === 'mobile-portrait';
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const comparisons = [
    { speciesId: 'sunny-sprout', plotId: 0, growthDurationMs: 8_000 },
    { speciesId: 'bubble-berry', plotId: 2, growthDurationMs: 15_000 },
    { speciesId: 'twistroot', plotId: 4, growthDurationMs: 25_000 },
  ] as const;

  for (const { speciesId, plotId, growthDurationMs } of comparisons) {
    const context = await browser.newContext({
      ...(mobile ? devices['Pixel 7'] : devices['Desktop Chrome']),
      viewport,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const { plots } = await openGame(page, info.project.name);
      const stage = await page.locator('#stage').boundingBox();
      expect(stage, 'production garden canvas has a CSS viewport').not.toBeNull();
      const cropStage = stage!;
      const cropWorldY = !mobile && speciesId === 'bubble-berry' ? 0.9 : 1.65;
      const baseline = await capturePlantCrop(page, cropStage, plotId, cropWorldY);
      await plant(page, speciesId, plots[plotId]!, mobile);
      await waitForCoins(page, 12 - SPECIES.find(({ id }) => id === speciesId)!.seedCost);

      const matureAtMs = Math.round(growthDurationMs * 0.95);
      await advanceGameClock(page, matureAtMs);
      await settlePresentation(page);
      const mature = await capturePlantCrop(page, cropStage, plotId, cropWorldY);
      const matureSignature = createHash('sha256').update(mature.image).digest('hex');
      expect(matureSignature, `${speciesId} at 0.95 has a rendered plant body`).not.toBe(
        createHash('sha256').update(baseline.image).digest('hex'),
      );

      await advanceGameClock(page, growthDurationMs - matureAtMs);
      await settlePresentation(page);
      await waitForRenderedStamps(page, [speciesId]);
      const harvestable = await capturePlantCrop(page, cropStage, plotId, cropWorldY);
      const stamp = await readStamp(page, speciesId);
      const masks = { polygons: projectDialPolygons(plotId, cropStage, harvestable.bounds) };
      const stampBox = {
          x: stamp.box.x - harvestable.bounds.x,
          y: stamp.box.y - harvestable.bounds.y,
          width: stamp.box.width,
          height: stamp.box.height,
      };
      const bodyMasks = await captureVisibleBodyMasks(page, { speciesId, plotId, stage: cropStage, crop: harvestable.bounds });
      const comparison = await comparePlantBodyPixels(page, baseline.image, mature.image, harvestable.image,
        stampBox, bodyMasks, masks);
      console.info(`${speciesId} ${info.project.name}: body ${comparison.changedBodyPixels}/${comparison.bodyPixels} ${(comparison.ratio * 100).toFixed(2)}%; masked-crop ${comparison.changedCropPixels}/${comparison.cropPixels} ${(comparison.cropRatio * 100).toFixed(2)}% against 15%`);
      const evidenceName = `${speciesId}-${info.project.name}`;
      for (const [state, image] of [['mature-0.95', mature], ['harvestable', harvestable]] as const) {
        await writeFile(info.outputPath(`${evidenceName}-${state}.png`), image.image);
        await info.attach(`${evidenceName}-${state}-120x120.png`, { body: image.image, contentType: 'image/png' });
      }
      const diagnosticPng = Buffer.from(comparison.diagnostics.split(',')[1]!, 'base64');
      await writeFile(info.outputPath(`${evidenceName}-pixel-mask-overlay.png`), diagnosticPng);
      await info.attach(`${evidenceName}-pixel-mask-overlay.png`, { body: diagnosticPng, contentType: 'image/png' });
      const comparisonJson = Buffer.from(JSON.stringify({
        speciesId,
        viewport,
        crop: harvestable.bounds,
        bodyPixels: comparison.bodyPixels,
        changedBodyPixels: comparison.changedBodyPixels,
        bodyRatio: comparison.ratio,
        unmaskedCropPixels: comparison.cropPixels,
        changedCropPixels: comparison.changedCropPixels,
        cropRatio: comparison.cropRatio,
        masks,
        stampBox,
      }, null, 2));
      await writeFile(info.outputPath(`${evidenceName}-pixel-comparison.json`), comparisonJson);
      await info.attach(`${evidenceName}-pixel-comparison.json`, { body: comparisonJson, contentType: 'application/json' });
      expect(comparison.bodyPixels, `${speciesId} crop contains plant-body pixels after status/shadow exclusions`).toBeGreaterThan(0);
      expect(comparison.ratio,
        `${speciesId} body pixels changed ${comparison.changedBodyPixels}/${comparison.bodyPixels} (${(comparison.ratio * 100).toFixed(1)}%) between Mature 0.95 and Harvestable; crop excludes the top stamp and bottom dial/peg/shadow area`,
      ).toBeGreaterThanOrEqual(0.15);
    } finally {
      await context.close();
    }
  }
});
