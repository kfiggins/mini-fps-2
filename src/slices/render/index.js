import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { GradeShader } from './grade.js';

// Render slice: owns the WebGL renderer, the post chain, camera FOV + shake,
// the viewmodel scene/camera, pooled flash lights and hit-stop.
//
// Listens: arena:ready (env), light, hitstop, player:hurt, shake, quality:changed
// Reads:   state.settings, state.player, state.fovScale, state.shake

// Performance model: arena shadows are baked once per load (not per frame),
// point lights are few (every lit pixel pays for every light), and AA is
// FXAA on medium / MSAA on high.
const QUALITY = {
  low: { ratio: 0.75, samples: 0, fxaa: false, bloom: false, shadows: 2048, soft: false },
  medium: { ratio: 1, samples: 0, fxaa: true, bloom: true, shadows: 2048, soft: false },
  high: { ratio: 1.25, samples: 0, fxaa: true, bloom: true, shadows: 4096, soft: true },
};
const LIGHT_POOL = 4;

export function createRender(state, bus) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // baked per arena — see bakeShadows()
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  renderer.domElement.id = 'game-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // viewmodel: its own scene + camera so guns never clip into walls and keep
  // a steady FOV while the world camera zooms
  const viewScene = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(62, camera.aspect, 0.01, 10);
  // viewmodel light rig: key from above-right, cool fill, and a rim light
  // from ahead so gun silhouettes read against any background
  const vmHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  const vmSun = new THREE.DirectionalLight(0xffffff, 3.2);
  vmSun.position.set(0.7, 1, 0.5);
  const vmFill = new THREE.DirectionalLight(0x9fb6ff, 1.1);
  vmFill.position.set(-1, 0.3, 0.6);
  const vmRim = new THREE.DirectionalLight(0xffffff, 2.2);
  vmRim.position.set(-0.4, 0.6, -1);
  viewScene.add(vmHemi, vmSun, vmFill, vmRim, viewCamera);

  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.viewScene = viewScene;
  state.viewCamera = viewCamera;
  state.fovScale = 1;

  // ---- pooled flash lights (adding/removing lights recompiles shaders) ----
  const lights = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 8, 2);
    l.visible = true;
    scene.add(l);
    lights.push({ light: l, life: 0, max: 1, peak: 0 });
  }
  let lightCursor = 0;
  bus.on('light', ({ pos, color = 0xffaa55, intensity = 20, dist = 8, life = 0.1 }) => {
    // reuse the dimmest light
    let slot = lights[lightCursor];
    for (const s of lights) if (s.life <= 0) { slot = s; break; }
    lightCursor = (lightCursor + 1) % LIGHT_POOL;
    slot.light.position.set(pos.x, pos.y, pos.z);
    slot.light.color.setHex(color);
    slot.light.distance = dist;
    slot.peak = intensity;
    slot.light.intensity = intensity;
    slot.life = life;
    slot.max = life;
  });

  // ---- post chain ----
  let composer = null;
  let bloomPass = null;
  let gradePass = null;
  let fxaaPass = null;
  let quality = null;
  const env = { exposure: 1, bloom: 0.55, bloomRadius: 0.5, bloomThreshold: 0.85, grade: {} };

  function buildComposer() {
    quality = QUALITY[state.settings.quality] || QUALITY.high;
    const ratio = Math.min(window.devicePixelRatio, quality.ratio);
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    }
    const w = Math.floor(window.innerWidth * ratio);
    const h = Math.floor(window.innerHeight * ratio);
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: quality.samples });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(ratio);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    const vmPass = new RenderPass(viewScene, viewCamera);
    vmPass.clear = false;
    vmPass.clearDepth = true;
    composer.addPass(vmPass);
    bloomPass = null;
    if (quality.bloom) {
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
        env.bloom, env.bloomRadius, env.bloomThreshold
      );
      composer.addPass(bloomPass);
    }
    composer.addPass(new OutputPass());
    gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
    fxaaPass = null;
    if (quality.fxaa) {
      fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.uniforms.resolution.value.set(1 / w, 1 / h);
      composer.addPass(fxaaPass);
    }
    applyGrade();
    renderer.shadowMap.type = quality.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    bakeShadows();
  }

  // static arena shadows: size the map for the preset and render it once
  function bakeShadows() {
    for (const l of state.world?.shadowLights || []) {
      if (l.shadow.mapSize.x !== quality.shadows) {
        l.shadow.mapSize.set(quality.shadows, quality.shadows);
        l.shadow.map?.dispose();
        l.shadow.map = null;
      }
    }
    renderer.shadowMap.needsUpdate = true;
  }
  bus.on('shadows:bake', () => { renderer.shadowMap.needsUpdate = true; });

  function applyGrade() {
    if (!gradePass) return;
    const u = gradePass.uniforms;
    const g = env.grade;
    u.saturation.value = g.saturation ?? 1.08;
    u.contrast.value = g.contrast ?? 1.06;
    u.tint.value.set(...(g.tint || [1, 1, 1]));
    u.lift.value.set(...(g.lift || [0, 0, 0]));
    u.vignette.value = g.vignette ?? 0.32;
    renderer.toneMappingExposure = env.exposure;
    if (bloomPass) {
      bloomPass.strength = env.bloom;
      bloomPass.radius = env.bloomRadius;
      bloomPass.threshold = env.bloomThreshold;
    }
  }

  bus.on('arena:ready', (world) => {
    Object.assign(env, world.env || {});
    const e = world.env || {};
    if (e.vmHemi) {
      vmHemi.color.setHex(e.vmHemi[0]);
      vmHemi.groundColor.setHex(e.vmHemi[1]);
    }
    if (e.vmSun) vmSun.color.setHex(e.vmSun);
    viewScene.environment = scene.environment;
    viewScene.environmentIntensity = e.vmEnvIntensity ?? 0.8;
    bakeShadows();
    applyGrade();
  });
  bus.on('quality:changed', buildComposer);

  // ---- feedback: hurt flash, shake, hit-stop ----
  let hurt = 0;
  let aberration = 0;
  bus.on('player:hurt', ({ amount }) => {
    hurt = Math.min(1, hurt + 0.35 + amount / 40);
    aberration = Math.min(1, aberration + amount / 50);
  });
  bus.on('shake', (amt) => { state.shake = Math.min(1, state.shake + amt); });
  bus.on('aberration', (amt) => { aberration = Math.min(1, aberration + amt); });
  let stopT = 0;
  bus.on('hitstop', ({ duration = 0.05, scale = 0.05 } = {}) => {
    stopT = Math.max(stopT, duration);
    state.timeScale = scale;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    viewCamera.aspect = camera.aspect;
    viewCamera.updateProjectionMatrix();
    buildComposer();
  });

  buildComposer();

  let shakeT = 0;
  const baseRot = new THREE.Euler();

  // auto quality: sample fps during live play; step down if it's struggling
  let autoT = 0, autoSum = 0, autoN = 0;
  function autoQuality(dt) {
    const s = state.settings;
    if (!s.qualityAuto || state.mode !== 'playing' || s.quality === 'low') return;
    autoT += dt;
    if (autoT < 2) return; // let shaders compile first
    autoSum += state.fps || 60;
    autoN++;
    if (autoT < 7) return;
    const avg = autoSum / autoN;
    autoT = autoSum = autoN = 0;
    if (avg < 42) {
      s.quality = s.quality === 'high' ? 'medium' : 'low';
      buildComposer();
      bus.emit('hud:feed', { text: `GRAPHICS → ${s.quality.toUpperCase()} (auto, for smoother play)`, color: '#9aa5b8' });
    } else {
      s.qualityAuto = false; // it runs fine — stop checking
    }
  }

  return {
    renderer,
    // realDt: unscaled frame time
    render(realDt) {
      autoQuality(realDt);
      // hit-stop recovers in real time
      if (stopT > 0) {
        stopT -= realDt;
        if (stopT <= 0) state.timeScale = 1;
      }

      for (const s of lights) {
        if (s.life <= 0) continue;
        s.life -= realDt;
        const t = Math.max(0, s.life / s.max);
        s.light.intensity = s.life > 0 ? s.peak * t * t : 0;
      }

      // FOV (weapons publish fovScale for ADS)
      // horizontal-at-16:9 → vertical, so ultrawides get extra side view
      // instead of a stretched, slow-feeling fisheye
      const h = ((state.settings.fovH || 90) * Math.PI) / 180;
      const vBase = (2 * Math.atan(Math.tan(h / 2) / (16 / 9)) * 180) / Math.PI;
      const fov = vBase * (state.fovScale || 1);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      // trauma shake: rotation offset only, applied around the player's aim
      state.shake = Math.max(0, state.shake - realDt * 1.6);
      shakeT += realDt * 30;
      const tr = state.shake * state.shake;
      baseRot.copy(camera.rotation);
      if (tr > 0.0001) {
        camera.rotation.x += Math.sin(shakeT * 1.13) * 0.035 * tr;
        camera.rotation.y += Math.sin(shakeT * 0.97 + 2) * 0.035 * tr;
        camera.rotation.z += Math.sin(shakeT * 1.31 + 4) * 0.05 * tr;
      }

      if (gradePass) {
        const u = gradePass.uniforms;
        hurt = Math.max(0, hurt - realDt * 1.8);
        aberration = Math.max(0, aberration - realDt * 2.5);
        const p = state.player;
        const low = p.alive && state.mode === 'playing' && !p.inMech
          ? Math.max(0, 1 - p.health / (p.maxHealth * 0.35)) : 0;
        u.hurt.value = Math.min(1, hurt + low * (0.45 + 0.15 * Math.sin(state.time * 6)));
        u.desat.value = low * 0.5 + (state.mode === 'over' ? 0.6 : 0);
        u.aberration.value = aberration * 0.006 + low * 0.0015;
        u.time.value = state.time;
      }

      composer.render(realDt);
      camera.rotation.copy(baseRot);
    },
  };
}
