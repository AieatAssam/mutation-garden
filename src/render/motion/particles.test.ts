import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createParticles } from './particles';

const burst = (count: number) => ({ origin: new Vector3(), count, colors: ['#ffffff'], speed: 1, up: 1, gravity: 4, lifeMs: 400, size: 0.1 });

describe('particles', () => {
  it('draws live particles in one instanced mesh and retires them after their life', () => {
    const particles = createParticles(16);
    expect(particles.mesh.instanceColor).not.toBeNull();
    particles.burst(burst(10), 0, false);
    particles.update(100);
    expect(particles.mesh.count).toBe(10);
    particles.update(401);
    expect(particles.liveCount).toBe(0);
    expect(particles.mesh.count).toBe(0);
    particles.dispose();
  });

  it('caps the pool and halves bursts for reduced motion', () => {
    const particles = createParticles(16);
    particles.burst(burst(30), 0, false);
    particles.update(10);
    expect(particles.liveCount).toBe(16);
    const reduced = createParticles(16);
    reduced.burst(burst(10), 0, true);
    reduced.update(10);
    expect(reduced.liveCount).toBe(5);
    particles.dispose();
    reduced.dispose();
  });
});
