// Spatial audio: keeps the AudioListener glued to the player camera and builds
// the per-voice positional chain (distance lowpass -> HRTF panner). Far sounds
// get darker and relatively wetter, like they would outdoors.

import * as THREE from 'three';

export const REF_DISTANCE = 4;
export const MAX_DISTANCE = 90;
export const CULL_DISTANCE = 105;

export function createSpatial(ctx) {
  const listener = ctx.listener;
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3(0, 0, -1);
  const modern = !!listener.positionX;

  function setListener(p, d) {
    if (modern) {
      const t = ctx.currentTime;
      listener.positionX.setTargetAtTime(p.x, t, 0.01);
      listener.positionY.setTargetAtTime(p.y, t, 0.01);
      listener.positionZ.setTargetAtTime(p.z, t, 0.01);
      listener.forwardX.setTargetAtTime(d.x, t, 0.01);
      listener.forwardY.setTargetAtTime(d.y, t, 0.01);
      listener.forwardZ.setTargetAtTime(d.z, t, 0.01);
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      listener.setPosition(p.x, p.y, p.z);
      listener.setOrientation(d.x, d.y, d.z, 0, 1, 0);
    }
  }

  return {
    listenerPos: pos,

    // Read the camera every frame.
    update(camera) {
      if (!camera) return;
      camera.getWorldPosition(pos);
      camera.getWorldDirection(dir);
      setListener(pos, dir);
    },

    distanceTo(p) {
      const dx = p.x - pos.x, dy = p.y - pos.y, dz = p.z - pos.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },

    // Wire voice.out through distance filter + panner into `dest`.
    // Returns { att } — the inverse-distance attenuation used for sends.
    attach(voice, p, dist, dest) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const far = Math.max(0, dist - 10) / (MAX_DISTANCE - 10);
      lp.frequency.value = 20000 * Math.pow(0.07, Math.min(1, far)); // 20k -> ~1.4k
      lp.Q.value = 0.5;
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = REF_DISTANCE;
      pan.maxDistance = MAX_DISTANCE;
      pan.rolloffFactor = 1;
      if (pan.positionX) {
        pan.positionX.value = p.x;
        pan.positionY.value = p.y;
        pan.positionZ.value = p.z;
      } else {
        pan.setPosition(p.x, p.y, p.z);
      }
      voice.out.connect(lp);
      lp.connect(pan);
      pan.connect(dest);
      voice.extra.push(lp, pan);
      const d = Math.min(Math.max(dist, REF_DISTANCE), MAX_DISTANCE);
      const att = REF_DISTANCE / (REF_DISTANCE + (d - REF_DISTANCE));
      return { att, far };
    },
  };
}
