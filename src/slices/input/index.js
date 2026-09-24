// Input slice: raw keyboard/mouse → state.input, plus edge events.
// Gameplay input only flows while the pointer is locked on the canvas.
//
// Publishes state.input: { keys, fire, aim, lookX, lookY, locked }
// Emits: key { code, repeat }  (keydown edges while locked)
//        keyup { code }
//        wheel { dir }
//        input:unlocked          (pointer lock lost — menu pauses)

export function createInput(state, bus) {
  const input = {
    keys: Object.create(null),
    fire: false,
    aim: false,
    lookX: 0,
    lookY: 0,
    locked: false,
  };
  state.input = input;
  const canvas = () => document.getElementById('game-canvas');

  document.addEventListener('pointerlockchange', () => {
    const was = input.locked;
    input.locked = document.pointerLockElement === canvas();
    if (!input.locked) {
      input.fire = false;
      input.aim = false;
      for (const k in input.keys) input.keys[k] = false;
      if (was) bus.emit('input:unlocked');
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    // guard against the occasional huge spike some browsers emit on lock
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    input.lookX += e.movementX;
    input.lookY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!input.locked) return;
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.aim = true;
    if (e.button === 0) bus.emit('key', { code: 'Mouse0', repeat: false });
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.aim = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (!input.locked) return;
    input.keys[e.code] = true;
    bus.emit('key', { code: e.code, repeat: e.repeat });
  });
  document.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
    bus.emit('keyup', { code: e.code });
  });
  document.addEventListener('wheel', (e) => {
    if (!input.locked || Math.abs(e.deltaY) < 1) return;
    bus.emit('wheel', { dir: Math.sign(e.deltaY) });
  }, { passive: true });
  window.addEventListener('blur', () => {
    for (const k in input.keys) input.keys[k] = false;
    input.fire = false;
  });

  return {
    lock() {
      const c = canvas();
      if (c && document.pointerLockElement !== c) {
        const p = c.requestPointerLock({ unadjustedMovement: true });
        // unadjustedMovement isn't supported everywhere — fall back quietly
        if (p && p.catch) p.catch(() => c.requestPointerLock());
      }
    },
    unlock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };
}
