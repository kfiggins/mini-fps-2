import { Vector3 } from 'three';

// Final display-space pass: colour grade, vignette, damage tint, chromatic
// aberration and a whisper of film grain.
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1.08 },
    contrast: { value: 1.06 },
    tint: { value: new Vector3(1, 1, 1) },
    lift: { value: new Vector3(0, 0, 0) },
    vignette: { value: 0.32 },
    hurt: { value: 0 },
    desat: { value: 0 },
    aberration: { value: 0 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, vignette, hurt, desat, aberration, time;
    uniform vec3 tint, lift;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (aberration > 0.0001) {
        vec2 off = c * aberration * (1.0 + r2 * 4.0);
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - off).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      col = col * tint + lift * (1.0 - col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation * (1.0 - desat));
      col = (col - 0.5) * contrast + 0.5;
      // vignette
      float v = smoothstep(0.85, 0.2, r2 * (1.0 + vignette * 1.5));
      col *= mix(1.0, v, vignette * 1.6);
      // damage: red creeping in from the edges
      float edge = smoothstep(0.05, 0.42, r2);
      col = mix(col, vec3(0.55, 0.02, 0.02), hurt * edge * 0.75);
      // grain
      col += (hash(vUv * 1000.0 + time) - 0.5) * 0.018;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
