import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { createGardenCamera, panGardenCamera, resizeGardenCamera, zoomGardenCamera } from '../../src/render/camera';
import { palette } from '../../src/render/palette';
import { SPECIES } from '../../src/sim';

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type SpeciesId = (typeof SPECIES)[number]['id'];
const speciesPlot: Record<SpeciesId, number> = { 'sunny-sprout': 0, 'bubble-berry': 2, twistroot: 4 };
const speciesStampWorldY: Record<SpeciesId, number> = {
  'sunny-sprout': 2.34,
  'bubble-berry': 1.54,
  twistroot: 2.01,
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
  speciesId: SpeciesId,
  pointerId: number,
  camera: ReturnType<typeof createGardenCamera>,
): Promise<void> {
  const bounds = await page.locator('#stage').boundingBox();
  expect(bounds).not.toBeNull();
  const dx = point.x - 50 >= bounds!.x ? -50 : 50;
  const before = await readStamp(page, speciesId, camera);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: pointerId, ...point }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: pointerId, x: point.x + dx, y: point.y }] });
  const during = await readStamp(page, speciesId, camera);
  expect(distance(during.center, before.center), 'a candidate ground contact pans the rendered camera synchronously')
    .toBeGreaterThan(20);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: pointerId, x: point.x, y: point.y }] });
  const restored = await readStamp(page, speciesId, camera);
  expect(distance(restored.center, before.center), 'the reversible ground probe restores the camera before pinch')
    .toBeLessThan(1);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
}

async function readStamp(
  page: Page,
  speciesId: SpeciesId,
  camera?: ReturnType<typeof createGardenCamera>,
): Promise<{ center: Point; box: Box }> {
  const fruitRamp = palette.plants[speciesId].fruit.slice(1);
  const tray = await page.getByRole('navigation', { name: 'Seeds' }).boundingBox();
  expect(tray).not.toBeNull();
  const canvas = page.locator('#stage');
  const stageBounds = await canvas.boundingBox();
  expect(stageBounds).not.toBeNull();
  const projectionCamera = camera ?? createGardenCamera();
  if (!camera) resizeGardenCamera(projectionCamera, stageBounds!.width, stageBounds!.height);
  const projectedStampRadius = 0.31 * stageBounds!.width * projectionCamera.zoom
    / (projectionCamera.right - projectionCamera.left);
  expect(projectedStampRadius, `${speciesLabels[speciesId]} projected stamp must be at least 26px wide`)
    .toBeGreaterThanOrEqual(13);
  const expected = projectPlotPoint(stageBounds!, speciesPlot[speciesId], speciesStampWorldY[speciesId], camera,
    speciesId === 'twistroot' ? -0.2 : 0);
  const owningPlot = projectPlotPoint(stageBounds!, speciesPlot[speciesId], 0.65, camera);
  const otherPlots = plotCenters(stageBounds!, 0.65, camera).filter((_, index) => index !== speciesPlot[speciesId]);
  const screenshot = await page.screenshot({ clip: stageBounds!, scale: 'css' });
  const inspected = await page.evaluate(async ({ encoded, fruitRamp, trayTop, expected, owningPlot, otherPlots, projectedStampRadius }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const scratch = document.createElement('canvas');
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not inspect the production canvas capture');
    context.drawImage(image, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, scratch.width, scratch.height);
    const stage = document.querySelector<HTMLCanvasElement>('#stage');
    if (!stage) throw new Error('Production garden canvas is missing');
    const rect = stage.getBoundingClientRect();
    const roiMinX = Math.max(0, Math.floor(Math.min(owningPlot.x, expected.x) - 120));
    const roiMaxX = Math.min(width, Math.ceil(Math.max(owningPlot.x, expected.x) + 120));
    const roiMinY = Math.max(80, Math.floor(Math.min(owningPlot.y, expected.y) - 220));
    const roiMaxY = Math.min(height, Math.ceil(trayTop - rect.top), Math.ceil(Math.max(owningPlot.y, expected.y) + 20));
    const targets = fruitRamp.map((fruitColor) => [1, 3, 5].map((offset) => Number.parseInt(fruitColor.slice(offset, offset + 2), 16)));
    const mask = new Uint8Array(width * height);
    for (let y = roiMinY; y < roiMaxY; y += 1) {
      for (let x = roiMinX; x < roiMaxX; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        if (targets.some((target) => Math.max(
          Math.abs(data[offset]! - target[0]!),
          Math.abs(data[offset + 1]! - target[1]!),
          Math.abs(data[offset + 2]! - target[2]!),
        ) <= 20)) mask[pixel] = 1;
      }
    }
    const visited = new Uint8Array(mask.length);
    const queue = new Int32Array(mask.length);
    const components: { minX: number; minY: number; maxX: number; maxY: number; area: number }[] = [];
    for (let origin = 0; origin < mask.length; origin += 1) {
      if (!mask[origin] || visited[origin]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = origin;
      visited[origin] = 1;
      const minX0 = origin % width;
      const minY0 = Math.floor(origin / width);
      let minX = minX0;
      let maxX = minX0;
      let minY = minY0;
      let maxY = minY0;
      while (head < tail) {
        const index = queue[head++]!;
        const x = index % width;
        const y = Math.floor(index / width);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [neighborX, neighborY] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]] as const) {
          if (neighborX < roiMinX || neighborX >= roiMaxX || neighborY < roiMinY || neighborY >= roiMaxY) continue;
          const neighbor = neighborY * width + neighborX;
          if (visited[neighbor] || !mask[neighbor]) continue;
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      components.push({ minX, minY, maxX, maxY, area: tail });
    }
    const nearOwner = components.map((component) => {
      const componentWidth = component.maxX - component.minX + 1;
      const componentHeight = component.maxY - component.minY + 1;
      const aspect = componentWidth / componentHeight;
      const centerX = (component.minX + component.maxX) / 2;
      const centerY = (component.minY + component.maxY) / 2;
      const ownerDistance = Math.hypot(centerX - owningPlot.x, centerY - owningPlot.y);
      const nearestOtherPlotDistance = Math.min(...otherPlots.map((plot) => Math.hypot(centerX - plot.x, centerY - plot.y)));
      return { ...component, centerX, centerY, expectedDistance: Math.hypot(centerX - expected.x, centerY - expected.y),
        componentWidth, componentHeight, aspect, ownerDistance, nearestOtherPlotDistance,
        belongsToPlot: Math.abs(centerX - owningPlot.x) <= 120 && centerY <= owningPlot.y + 20
          && centerY >= owningPlot.y - 220 };
    }).filter((component) => component.area >= 10 && component.componentWidth <= 72 && component.componentHeight <= 72
      && component.aspect >= 0.5 && component.aspect <= 2 && component.belongsToPlot && component.expectedDistance <= 48)
      .sort((a, b) => a.expectedDistance - b.expectedDistance || b.area - a.area);
    const ink = [43, 30, 46];
    const paper = [[247, 238, 219], [255, 249, 236]];
    const near = (x: number, y: number, colors: number[][], tolerance: number) => {
      const offset = (y * width + x) * 4;
      return colors.some((color) => Math.max(
        Math.abs(data[offset]! - color[0]!), Math.abs(data[offset + 1]! - color[1]!), Math.abs(data[offset + 2]! - color[2]!),
            ) <= tolerance);
    };
    const centerCandidates = nearOwner.slice(0, 4).flatMap((component) =>
      [-2, -1, 0, 1, 2].flatMap((offsetY) => [-2, -1, 0, 1, 2].map((offsetX) => ({
        centerX: component.centerX + offsetX, centerY: component.centerY + offsetY,
      }))));
    const ringCandidates = centerCandidates.flatMap((candidate) => {
      const radii = [projectedStampRadius - 0.5, projectedStampRadius, projectedStampRadius + 0.5];
      return radii.map((radius) => {
        const inkDistances: number[] = [];
        let paperHits = 0;
        let fruitHits = 0;
        const samples = 48;
        for (let sample = 0; sample < samples; sample += 1) {
          const angle = sample * Math.PI * 2 / samples;
          const farthestInkHit = (ratios: number[], radialOffsets: number[], tangentialOffsets: number[]) => {
            let farthest: number | null = null;
            for (const ratio of ratios) {
              for (const radialOffset of radialOffsets) {
                const radialDistance = radius * ratio + radialOffset;
                for (const tangentialOffset of tangentialOffsets) {
                  const x = Math.round(candidate.centerX + Math.cos(angle) * radialDistance
                    - Math.sin(angle) * tangentialOffset);
                  const y = Math.round(candidate.centerY + Math.sin(angle) * radialDistance
                    + Math.cos(angle) * tangentialOffset);
                  if (x < 0 || x >= width || y < 0 || y >= height || !near(x, y, [ink], 36)) continue;
                  const hitDistance = Math.hypot(x - candidate.centerX, y - candidate.centerY);
                  if (farthest === null || hitDistance > farthest) farthest = hitDistance;
                }
              }
            }
            return farthest;
          };
          const findHitDistance = (
            ratios: number[], colors: number[][], tolerance: number,
            radialOffsets: number[], tangentialOffsets: number[] = [0],
          ) => {
            let bestDistance: number | null = null;
            for (const ratio of ratios) {
              for (const radialOffset of radialOffsets) {
                const radialDistance = radius * ratio + radialOffset;
                for (const tangentialOffset of tangentialOffsets) {
                  const x = Math.round(candidate.centerX + Math.cos(angle) * radialDistance
                    - Math.sin(angle) * tangentialOffset);
                  const y = Math.round(candidate.centerY + Math.sin(angle) * radialDistance
                    + Math.cos(angle) * tangentialOffset);
                  if (x < 0 || x >= width || y < 0 || y >= height || !near(x, y, colors, tolerance)) continue;
                  const hitDistance = Math.hypot(x - candidate.centerX, y - candidate.centerY);
                  if (bestDistance === null || Math.abs(hitDistance - radius * 0.89) < Math.abs(bestDistance - radius * 0.89)) {
                    bestDistance = hitDistance;
                  }
                }
              }
            }
            return bestDistance;
          };
          const inkDistance = farthestInkHit([0.89, 0.92, 0.95, 0.98, 1], [-1, 0, 1], [-1, 0, 1]);
          if (inkDistance !== null) inkDistances.push(inkDistance);
          if (findHitDistance([0.72, 0.77, 0.81], paper, 34, [-1, 0, 1], [-1, 0, 1]) !== null) paperHits += 1;
          if (findHitDistance([0.42, 0.48, 0.54], targets, 36, [-2, 0, 2], [-1, 0, 1]) !== null) fruitHits += 1;
        }
        return { ...candidate, radius, expectedDistance: Math.hypot(candidate.centerX - expected.x, candidate.centerY - expected.y),
          inkHits: inkDistances.length, paperHits, fruitHits, samples,
          measuredFaceRadius: inkDistances.length ? [...inkDistances].sort((a, b) => a - b)[Math.floor(inkDistances.length / 2)]! : 0 };
      });
    }).sort((a, b) => Math.min(b.inkHits, b.paperHits, b.fruitHits) - Math.min(a.inkHits, a.paperHits, a.fruitHits)
      || a.expectedDistance - b.expectedDistance);
    const selected = ringCandidates.find((candidate) => candidate.inkHits / candidate.samples >= 0.7
      && candidate.paperHits / candidate.samples >= 0.7 && candidate.fruitHits / candidate.samples >= 0.7);
    if (!selected) return { debug: components.map((component) => {
      const x = (component.minX + component.maxX) / 2;
      const y = (component.minY + component.maxY) / 2;
      const ownerDistance = Math.hypot(x - owningPlot.x, y - owningPlot.y);
      const otherDistance = Math.min(...otherPlots.map((plot) => Math.hypot(x - plot.x, y - plot.y)));
      const componentWidth = component.maxX - component.minX + 1;
      const componentHeight = component.maxY - component.minY + 1;
      return {
        x, y, width: componentWidth, height: componentHeight,
        area: component.area, expectedDistance: Math.hypot(x - expected.x, y - expected.y),
        ownerDistance, nearestOtherPlotDistance: otherDistance,
        inOwnerRegion: Math.abs(x - owningPlot.x) <= 120 && y <= owningPlot.y + 20 && y >= owningPlot.y - 220,
        inOwnerVoronoi: ownerDistance < otherDistance,
        bestStampPattern: [...ringCandidates].sort((a, b) => Math.hypot(a.centerX - x, a.centerY - y)
          - Math.hypot(b.centerX - x, b.centerY - y)).slice(0, 1)
          .map(({ radius, inkHits, paperHits, fruitHits, samples }) => ({ radius, inkHits, paperHits, fruitHits, samples })),
      };
    }).filter((component) => component.inOwnerRegion).sort((a, b) => a.expectedDistance - b.expectedDistance).slice(0, 20),
    bestPatterns: [...ringCandidates].sort((a, b) => (b.inkHits + b.paperHits + b.fruitHits)
      - (a.inkHits + a.paperHits + a.fruitHits)).slice(0, 10)
      .map(({ centerX, centerY, radius, inkHits, paperHits, fruitHits, expectedDistance, measuredFaceRadius }) => ({
        centerX, centerY, radius, measuredFaceRadius, inkHits, paperHits, fruitHits, expectedDistance,
      })),
    stageCapture: { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      imageWidth: width, imageHeight: height, expectedLocal: expected,
      expectedGlobal: { x: expected.x + rect.left, y: expected.y + rect.top }, projectedStampRadius },
    sampleColors: (() => {
      const centerX = expected.x - 6;
      const centerY = expected.y - 18;
      const radius = 15;
      return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => [0.48, 0.765, 0.945].map((ratio) => {
        const x = Math.round(centerX + Math.cos(angle) * radius * ratio);
        const y = Math.round(centerY + Math.sin(angle) * radius * ratio);
        const offset = (y * width + x) * 4;
        return { x, y, rgb: [data[offset], data[offset + 1], data[offset + 2]] };
      }));
    })() };
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const centerX = selected.centerX;
    const centerY = selected.centerY;
    const radius = selected.measuredFaceRadius;
    const box = {
      x: rect.left + (centerX - radius) * scaleX,
      y: rect.top + (centerY - radius) * scaleY,
      width: radius * 2 * scaleX,
      height: radius * 2 * scaleY,
    };
    return {
      box,
      center: { x: rect.left + centerX * scaleX, y: rect.top + centerY * scaleY },
    };
  }, {
    encoded: screenshot.toString('base64'), fruitRamp, trayTop: tray!.y,
    expected: { x: expected.x - stageBounds!.x, y: expected.y - stageBounds!.y },
    owningPlot: { x: owningPlot.x - stageBounds!.x, y: owningPlot.y - stageBounds!.y },
    otherPlots: otherPlots.map(({ x, y }) => ({ x: x - stageBounds!.x, y: y - stageBounds!.y })),
    projectedStampRadius,
  });
  expect(inspected && 'box' in inspected, `settled ${speciesLabels[speciesId]} stamp should be visible near projected plot ${speciesPlot[speciesId]} top ${JSON.stringify(expected)}; nearest ramp components=${JSON.stringify(inspected?.debug)}; best rings=${JSON.stringify('bestPatterns' in (inspected ?? {}) ? inspected.bestPatterns : [])}; sample colors=${JSON.stringify('sampleColors' in (inspected ?? {}) ? inspected.sampleColors : [])}; capture=${JSON.stringify('stageCapture' in (inspected ?? {}) ? inspected.stageCapture : {})}`).toBe(true);
  const found = inspected as { box: Box; center: Point };
  const stampDiagnostic = `${speciesLabels[speciesId]} projected stamp center=${JSON.stringify(found!.center)} bbox=${JSON.stringify(found!.box)}`;
  expect(found!.box.width, `${stampDiagnostic} width`).toBeGreaterThanOrEqual(26);
  expect(found!.box.height, `${stampDiagnostic} height`).toBeGreaterThanOrEqual(26);
  expect(found!.box.width / found!.box.height, `${stampDiagnostic} detected stamp stays compact and near-circular`)
    .toBeGreaterThanOrEqual(0.5);
  expect(found!.box.width / found!.box.height, `${stampDiagnostic} detected stamp stays compact and near-circular`)
    .toBeLessThanOrEqual(1.5);
  return found!;
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

  for (const [index, speciesId] of (['sunny-sprout', 'bubble-berry', 'twistroot'] as const).entries()) {
    const stamp = renderedStamps[speciesId];
    expect(stamp.box.width, `${speciesId} stamp width`).toBeGreaterThanOrEqual(26);
    expect(stamp.box.height, `${speciesId} stamp height`).toBeGreaterThanOrEqual(26);
    expect(stamp.box.x).toBeGreaterThanOrEqual(0);
    expect(stamp.box.y).toBeGreaterThanOrEqual(0);
    expect(stamp.box.x + stamp.box.width).toBeLessThanOrEqual(viewport.width);
    expect(stamp.box.y + stamp.box.height).toBeLessThanOrEqual(viewport.height);
    expect(stamp.box.y + stamp.box.height).toBeLessThan(tray!.y);

    await realActivate(page, stamp.center, mobile);
    await waitForCoins(page, [5, 11, 21][index]!);
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
  await realSwipe(page, gesture, mobile);
  await realSwipe(page, gesture, mobile);
  expect(await deliveredFrames(page)).toBe(frames);
  expect(await stageSignature(page), 'both repeated stamp-start swipes leave the garden and camera unchanged while frames are frozen')
    .toBe(beforeRepeat);
  await resumeFrames(page);
  await waitForCoins(page, 21);
  await waitForSimulationOpportunity(page);
  await waitForCoins(page, 21);
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
  await realActivate(page, stampAfterPan.center, mobile);
  expect(await deliveredFrames(page)).toBe(frames);
  await resumeFrames(page);
  await waitForCoins(page, 5);
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
    await probeGroundByReversiblePan(page, session!, groundPair[0], 'bubble-berry', 7, camera);
    await probeGroundByReversiblePan(page, session!, groundPair[1], 'bubble-berry', 8, camera);
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
  await realActivate(page, stampAfterZoom.center, mobile);
  expect(await deliveredFrames(page)).toBe(frames);
  await resumeFrames(page);
  await waitForCoins(page, 11);
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
  await realActivate(page, stampAfterResize.center, mobile);
  expect(await deliveredFrames(page)).toBe(frames);
  expect(Number(await page.locator('body').getAttribute('data-pointer-down-at-frame'))).toBe(frames);
  await resumeFrames(page);
  await waitForCoins(page, 21);
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
