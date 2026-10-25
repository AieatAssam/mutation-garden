import { MAX_LAB_SPECIMENS } from '../sim';

export async function startLaboratoryPhysics(): Promise<{ drop: (id: number) => void; release: (id: number) => void; pose: (id: number) => { x: number; y: number }; dispose: () => void }> {
  const RAPIER = await import('@dimforge/rapier3d-compat');
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.2, 1), floor);
  for (const x of [-0.82, 0.82]) {
    const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.9, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.08, 1.4, 0.7), wall);
  }
  const bodies = Array.from({ length: MAX_LAB_SPECIMENS }, (_, index) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(index * 0.2, -10, 0).setCanSleep(true));
    world.createCollider(RAPIER.ColliderDesc.ball(0.28).setRestitution(0.35), body);
    body.sleep();
    return body;
  });
  const slots = new Map<number, number>();
  const freeSlots = new Set(bodies.map((_, index) => index));
  let frame = 0;
  let active = true;
  let previous: number | undefined;
  let accumulator = 0;
  const tick = (now: number) => {
    if (!active) return;
    if (previous !== undefined) accumulator += Math.min((now - previous) / 1000, 0.1);
    previous = now;
    while (accumulator >= world.timestep) { world.step(); accumulator -= world.timestep; }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    drop: (id) => {
      let slot = slots.get(id);
      if (slot === undefined) {
        slot = freeSlots.values().next().value;
        if (slot === undefined) return;
        freeSlots.delete(slot); slots.set(id, slot);
      }
      const body = bodies[slot]!;
      body.setTranslation({ x: 0, y: 2.5, z: 0 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.wakeUp();
    },
    release: (id) => { const slot = slots.get(id); if (slot === undefined) return; slots.delete(id); freeSlots.add(slot); bodies[slot]!.setTranslation({ x: 0, y: -10, z: 0 }, true); bodies[slot]!.sleep(); },
    pose: (id) => { const slot = slots.get(id); if (slot === undefined) return { x: 0, y: 0 }; const { x, y } = bodies[slot]!.translation(); return { x, y }; },
    dispose: () => { active = false; cancelAnimationFrame(frame); world.free(); },
  };
}
