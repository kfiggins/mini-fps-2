import * as THREE from 'three';

// GPU particles: every particle's whole life is computed in the vertex
// shader from its spawn state (position, velocity, gravity, drag, birth
// time), so the CPU only writes a ring buffer when particles are born.

const vert = /* glsl */ `
  attribute vec3 velocity;
  attribute vec4 color;      // rgb + alpha
  attribute vec4 params;     // birth, life, size0, size1
  attribute vec2 physics;    // gravity (m/s², negative = down), drag
  uniform float uTime;
  uniform float uScale;
  varying vec4 vColor;
  varying float vT;
  void main() {
    float age = uTime - params.x;
    float t = age / params.y;
    if (t < 0.0 || t > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    float k = physics.y;
    vec3 disp = k > 0.001 ? velocity * (1.0 - exp(-k * age)) / k : velocity * age;
    vec3 p = position + disp + vec3(0.0, 0.5 * physics.x * age * age, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = mix(params.z, params.w, t);
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    vColor = color;
    vT = t;
  }`;

const frag = /* glsl */ `
  uniform float uSoft;
  varying vec4 vColor;
  varying float vT;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, uSoft);
    float fade = (1.0 - vT) * (1.0 - vT);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a * fade);
  }`;

export class ParticleSystem {
  constructor(scene, capacity, additive) {
    this.cap = capacity;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    const mk = (n) => new THREE.BufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    this.pos = mk(3);
    this.vel = mk(3);
    this.col = mk(4);
    this.par = mk(4);
    this.phy = mk(2);
    // park unborn particles far in the past
    for (let i = 0; i < capacity; i++) this.par.array[i * 4] = -1000, this.par.array[i * 4 + 1] = 1;
    g.setAttribute('position', this.pos);
    g.setAttribute('velocity', this.vel);
    g.setAttribute('color', this.col);
    g.setAttribute('params', this.par);
    g.setAttribute('physics', this.phy);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uTime: { value: 0 },
      uScale: { value: 400 },
      uSoft: { value: additive ? 1.6 : 1.1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    this.dirtyFrom = capacity;
    this.dirtyTo = -1;
  }

  // o: { x,y,z, vx,vy,vz, r,g,b,a, life, size0, size1, gravity, drag }
  emit(o, time) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    const p = this.pos.array, v = this.vel.array, c = this.col.array, pa = this.par.array, ph = this.phy.array;
    p[i * 3] = o.x; p[i * 3 + 1] = o.y; p[i * 3 + 2] = o.z;
    v[i * 3] = o.vx || 0; v[i * 3 + 1] = o.vy || 0; v[i * 3 + 2] = o.vz || 0;
    c[i * 4] = o.r; c[i * 4 + 1] = o.g; c[i * 4 + 2] = o.b; c[i * 4 + 3] = o.a ?? 1;
    pa[i * 4] = time; pa[i * 4 + 1] = o.life; pa[i * 4 + 2] = o.size0; pa[i * 4 + 3] = o.size1 ?? o.size0;
    ph[i * 2] = o.gravity ?? 0; ph[i * 2 + 1] = o.drag ?? 0;
    if (i < this.dirtyFrom) this.dirtyFrom = i;
    if (i > this.dirtyTo) this.dirtyTo = i;
  }

  update(time, viewportH, fovDeg) {
    this.uniforms.uTime.value = time;
    // pixels per world unit at distance 1
    this.uniforms.uScale.value = viewportH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    if (this.dirtyTo >= this.dirtyFrom) {
      const from = this.dirtyFrom, count = this.dirtyTo - this.dirtyFrom + 1;
      for (const [attr, n] of [[this.pos, 3], [this.vel, 3], [this.col, 4], [this.par, 4], [this.phy, 2]]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(from * n, count * n);
        attr.needsUpdate = true;
      }
      this.dirtyFrom = this.cap;
      this.dirtyTo = -1;
    }
  }
}
