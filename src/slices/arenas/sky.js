import * as THREE from 'three';

// Procedural sky dome (gradient + sun + drifting fbm clouds + optional stars)
// and the PMREM environment map baked from it, so PBR metal reflects the sky.

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const frag = /* glsl */ `
  uniform vec3 top, horizon, bottom, sunColor, sunDir, cloudColor;
  uniform float sunSize, cloudAmount, stars, time, haze;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.03; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(horizon, bottom, clamp(-h * 3.0, 0.0, 1.0));
    // sun disc + glow
    float sd = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(sd, 900.0 / sunSize) * 6.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12);
    // clouds on a flat layer above
    if (h > 0.0 && cloudAmount > 0.0) {
      vec2 uv = d.xz / (h + 0.12) * 1.4 + vec2(time * 0.006, time * 0.002);
      float c = fbm(uv);
      c = smoothstep(1.0 - cloudAmount, 1.0 - cloudAmount + 0.35, c);
      float lit = 0.75 + 0.5 * pow(sd, 4.0);
      col = mix(col, cloudColor * lit, c * smoothstep(0.0, 0.2, h) * 0.85);
    }
    if (stars > 0.0 && h > 0.0) {
      vec2 sp = d.xz / (h + 0.3) * 160.0;
      float s = step(0.9965, hash(floor(sp))) * (0.5 + 0.5 * sin(time * 2.0 + hash(floor(sp) + 3.0) * 30.0));
      col += vec3(s) * stars * smoothstep(0.05, 0.4, h);
    }
    // horizon haze band
    col = mix(col, horizon, haze * exp(-abs(h) * 14.0));
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createSky(root, scene, renderer, opts) {
  const uniforms = {
    top: { value: new THREE.Color(opts.top) },
    horizon: { value: new THREE.Color(opts.horizon) },
    bottom: { value: new THREE.Color(opts.bottom ?? opts.horizon) },
    sunColor: { value: new THREE.Color(opts.sunColor ?? 0xffffff) },
    sunDir: { value: new THREE.Vector3(...(opts.sunDir ?? [0.5, 0.6, 0.3])).normalize() },
    cloudColor: { value: new THREE.Color(opts.cloudColor ?? 0xffffff) },
    sunSize: { value: opts.sunSize ?? 1 },
    cloudAmount: { value: opts.clouds ?? 0.35 },
    stars: { value: opts.stars ?? 0 },
    haze: { value: opts.haze ?? 0.5 },
    time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  root.add(dome);

  // environment: bake the sky (clouds off) + a ground-coloured lower hemisphere
  const envScene = new THREE.Scene();
  const envMat = mat.clone();
  envMat.uniforms.cloudAmount.value = 0;
  envMat.uniforms.bottom.value = new THREE.Color(opts.ground ?? opts.bottom ?? 0x555555);
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = opts.envIntensity ?? 0.7;
  pmrem.dispose();

  return {
    dome,
    update(dt, camPos) {
      uniforms.time.value += dt;
      dome.position.copy(camPos);
    },
  };
}

// Distant silhouettes (dunes, mountains, skyline) — a ring of displaced
// geometry well outside the arena, tinted toward the horizon by fog.
export function createHorizon(scene, { radius = 160, height = 18, color = 0x9a7b55, seed = 1, jag = 1, y = -2 } = {}) {
  const seg = 160;
  const pos = [];
  const idx = [];
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const phases = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const hgt = height * (0.45
      + 0.3 * Math.sin(a * 3 + phases[0])
      + 0.18 * Math.sin(a * 7 + phases[1]) * jag
      + 0.1 * Math.sin(a * 17 + phases[2]) * jag
      + 0.05 * Math.sin(a * 41 + phases[3]) * jag);
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    pos.push(x, y, z, x * 1.02, y + Math.max(2, hgt), z * 1.02);
    if (i < seg) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  scene.add(mesh);
  return mesh;
}
