import { Color, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';

export interface ParticleBurst {
  readonly origin: Vector3;
  readonly count: number;
  /** Palette colours, picked in turn. */
  readonly colors: readonly string[];
  /** Outward speed in world units per second. */
  readonly speed: number;
  /** Upward speed added to every particle. Negative falls. */
  readonly up: number;
  readonly gravity: number;
  readonly lifeMs: number;
  readonly size: number;
}

interface Particle {
  readonly position: Vector3;
  readonly velocity: Vector3;
  gravity: number;
  bornMs: number;
  lifeMs: number;
  size: number;
  spin: number;
}

export interface Particles {
  /** One instanced mesh for every effect: one draw call (motion.md 3). */
  readonly mesh: InstancedMesh;
  burst(burst: ParticleBurst, nowMs: number, reducedMotion: boolean): void;
  update(nowMs: number): void;
  readonly liveCount: number;
  dispose(): void;
}

export const PARTICLE_CAPACITY = 256;

export function createParticles(capacity = PARTICLE_CAPACITY): Particles {
  const geometry = new IcosahedronGeometry(1, 0);
  const material = new MeshBasicMaterial({ toneMapped: false });
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.name = 'particles';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  // Create instance colours now so the shader is compiled with them before the first burst.
  mesh.setColorAt(0, new Color(1, 1, 1));
  mesh.count = 0;
  const live: Particle[] = [];
  const colors: Color[] = [];
  const dummy = new Object3D();
  const color = new Color();
  let seed = 1;
  // ponytail: a tiny LCG keeps particle scatter deterministic in tests; looks random enough on screen.
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  let lastNow = 0;

  return {
    mesh,
    burst(burst, nowMs, reducedMotion) {
      const count = reducedMotion ? Math.ceil(burst.count / 2) : burst.count;
      for (let index = 0; index < count; index += 1) {
        if (live.length >= capacity) {
          live.shift();
          colors.shift();
        }
        const angle = random() * Math.PI * 2;
        const speed = reducedMotion ? burst.speed * 0.3 : burst.speed * (0.6 + random() * 0.6);
        live.push({
          position: burst.origin.clone(),
          velocity: new Vector3(Math.cos(angle) * speed, (reducedMotion ? 0.3 : 1) * burst.up * (0.7 + random() * 0.6),
            Math.sin(angle) * speed),
          gravity: burst.gravity,
          bornMs: nowMs,
          lifeMs: burst.lifeMs,
          size: burst.size * (0.7 + random() * 0.6),
          spin: random() * 6,
        });
        colors.push(new Color(burst.colors[index % burst.colors.length]!));
      }
      lastNow = nowMs;
    },
    update(nowMs) {
      const dt = Math.min(0.05, Math.max(0, (nowMs - lastNow) / 1000));
      lastNow = nowMs;
      let write = 0;
      for (let index = 0; index < live.length; index += 1) {
        const particle = live[index]!;
        const age = nowMs - particle.bornMs;
        if (age >= particle.lifeMs) continue;
        const persistent = particle.lifeMs > 10_000;
        particle.velocity.y -= particle.gravity * dt;
        particle.position.addScaledVector(particle.velocity, dt);
        const t = age / particle.lifeMs;
        // Pop in fast, shrink out: reads as a puff without transparency sorting.
        const scale = persistent ? particle.size : particle.size * Math.min(1, t * 6) * (1 - t * t);
        dummy.position.copy(particle.position);
        dummy.rotation.set(persistent ? 0 : particle.spin * t, persistent ? 0 : particle.spin * t * 0.7, 0);
        dummy.scale.setScalar(Math.max(0.0001, scale));
        dummy.updateMatrix();
        live[write] = particle;
        colors[write] = colors[index]!;
        mesh.setMatrixAt(write, dummy.matrix);
        mesh.setColorAt(write, color.copy(colors[write]!));
        write += 1;
      }
      live.length = write;
      colors.length = write;
      mesh.count = write;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    get liveCount() {
      return live.length;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
