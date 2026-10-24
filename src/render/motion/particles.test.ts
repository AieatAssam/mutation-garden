import { Matrix4, Vector3 } from 'three';
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

  it('keeps long-lived tell glints visible and stationary', () => {
    const particles = createParticles(2);
    particles.burst({ ...burst(1), speed: 0, up: 0, gravity: 0, lifeMs: 1_000_000_000 }, 0, true);
    particles.update(1_000);
    const matrix = new Matrix4();
    particles.mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[0]).toBeGreaterThan(0.04);
    expect(matrix.elements[12]).toBe(0);
    expect(matrix.elements[13]).toBe(0);
    expect(matrix.elements[14]).toBe(0);
    particles.dispose();
  });
});
