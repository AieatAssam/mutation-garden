import { BoxGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { createAmbient, MAX_BUTTERFLIES, MAX_LEAVES } from './ambient';

describe('ambient life', () => {
  const shapes = new Map([['wing', new BoxGeometry()], ['leaf', new BoxGeometry()]]);

  it('keeps butterflies and leaves within their caps and drops them under reduced motion', () => {
    const ambient = createAmbient(shapes);
    let leavesSeen = 0;
    for (let now = 1.7e12; now < 1.7e12 + 120_000; now += 250) {
      ambient.update(now, false);
      expect(ambient.counts.butterflies).toBeLessThanOrEqual(MAX_BUTTERFLIES);
      expect(ambient.counts.leaves).toBeLessThanOrEqual(MAX_LEAVES);
      leavesSeen += ambient.counts.leaves;
    }
    // Roughly one leaf every 6 to 10 s, alive for 4 s.
    expect(leavesSeen).toBeGreaterThan(100);
    ambient.update(1.7e12, true);
    expect(ambient.counts).toEqual({ butterflies: 0, leaves: 0 });
    ambient.dispose();
  });
});
