// Audio engine core: builds the master graph on any BaseAudioContext (live or
// offline) and pre-renders every shared resource once — noise buffers, the
// convolution reverb impulse, and waveshaper curves.
//
// Graph:
//   sfx.dry ─────────────┐
//   sfx.rev ──┐          │
//   sfx.echo ─┼─ echo ───┤
//   music.rev ┼─ revIn ─ convolver ─ revOut ─┤
//   music.in ─ musicLP ─ musicGain ──────────┤
//                                          mix ─ glue comp ─ limiter ─ softclip ─ master ─ out
// The softclip curve saturates at ~0.9, so the output can never exceed 1.0.

export function createEngine(ctx, { dynamics = true } = {}) {
  const buffers = makeBuffers(ctx);
  const curves = makeCurves();

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  const clip = ctx.createWaveShaper();
  clip.curve = curves.limit;
  clip.oversample = '2x';
  clip.connect(master);

  const mix = ctx.createGain();
  mix.gain.value = 0.9;
  if (dynamics) {
    // Note: Chrome's compressor adds automatic makeup gain, so keep the glue
    // gentle (it mostly ducks music under big hits) and let the limiter catch peaks.
    const limiter = compressor(ctx, -2, 0, 20, 0.001, 0.08);
    const glue = compressor(ctx, -10, 6, 2.5, 0.005, 0.25);
    mix.connect(glue);
    glue.connect(limiter);
    limiter.connect(clip);
  } else {
    mix.connect(clip);
  }

  // ---- reverb (shared by sfx + music) ----
  const revIn = ctx.createGain();
  const revHp = ctx.createBiquadFilter();
  revHp.type = 'highpass';
  revHp.frequency.value = 220;
  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  convolver.buffer = buffers.ir;
  const revOut = ctx.createGain();
  revOut.gain.value = 0.55;
  revIn.connect(revHp);
  revHp.connect(convolver);
  convolver.connect(revOut);
  revOut.connect(mix);

  // ---- echo (slapback off distant walls; used by big guns) ----
  const echoIn = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.29;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 2400;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.55;
  echoIn.connect(delay);
  delay.connect(echoLp);
  echoLp.connect(fb);
  fb.connect(delay);
  echoLp.connect(echoOut);
  echoOut.connect(mix);
  const echoToRev = ctx.createGain();
  echoToRev.gain.value = 0.4;
  echoOut.connect(echoToRev);
  echoToRev.connect(revIn);

  // ---- sfx buses (each carries the sfx volume so tails follow the slider) ----
  const sfxDry = ctx.createGain();
  const sfxRev = ctx.createGain();
  const sfxEcho = ctx.createGain();
  sfxDry.connect(mix);
  sfxRev.connect(revIn);
  sfxEcho.connect(echoIn);

  // ---- music bus ----
  const musicIn = ctx.createGain();
  const musicLp = ctx.createBiquadFilter();
  musicLp.type = 'lowpass';
  musicLp.frequency.value = 20000;
  musicLp.Q.value = 0.5;
  const musicGain = ctx.createGain();
  musicIn.connect(musicLp);
  musicLp.connect(musicGain);
  musicGain.connect(mix);
  const musicRev = ctx.createGain();
  const musicRevGain = ctx.createGain();
  musicRev.connect(musicRevGain);
  musicRevGain.connect(revIn);

  const MUSIC_BASE = 0.42;
  const vols = { master: -1, sfx: -1, music: -1, duck: -1 };
  const curve = (v) => Math.pow(Math.max(0, Math.min(1, v)), 1.6);

  function setParam(param, value, tc = 0.05) {
    param.setTargetAtTime(value, ctx.currentTime, tc);
  }

  return {
    ctx,
    buffers,
    curves,
    sfx: { dry: sfxDry, rev: sfxRev, echo: sfxEcho },
    music: { in: musicIn, rev: musicRev },
    // Ramp bus gains; cheap to call every frame (only touches changed values).
    setVolumes(master01, sfx01, music01, paused) {
      const duck = paused ? 1 : 0;
      if (master01 !== vols.master) {
        vols.master = master01;
        setParam(master.gain, curve(master01));
      }
      if (sfx01 !== vols.sfx) {
        vols.sfx = sfx01;
        const g = curve(sfx01);
        setParam(sfxDry.gain, g);
        setParam(sfxRev.gain, g);
        setParam(sfxEcho.gain, g);
      }
      if (music01 !== vols.music || duck !== vols.duck) {
        vols.music = music01;
        const changedDuck = duck !== vols.duck;
        vols.duck = duck;
        const g = curve(music01) * MUSIC_BASE * (paused ? 0.4 : 1);
        setParam(musicGain.gain, g, 0.25);
        setParam(musicRevGain.gain, g, 0.25);
        if (changedDuck) setParam(musicLp.frequency, paused ? 650 : 20000, 0.2);
      }
    },
    // Offline/lab helper: set everything instantly.
    setVolumesNow(master01, sfx01, music01) {
      master.gain.value = curve(master01);
      const s = curve(sfx01);
      sfxDry.gain.value = s;
      sfxRev.gain.value = s;
      sfxEcho.gain.value = s;
      const m = curve(music01) * MUSIC_BASE;
      musicGain.gain.value = m;
      musicRevGain.gain.value = m;
      vols.master = master01;
      vols.sfx = sfx01;
      vols.music = music01;
      vols.duck = 0;
    },
  };
}

function compressor(ctx, threshold, knee, ratio, attack, release) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.knee.value = knee;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  return c;
}

// ---------------------------------------------------------------------------
// Pre-rendered buffers. Everything here is allocated once per context.

function makeBuffers(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2);
  const mk = (fill) => {
    const b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    fill(d);
    normalize(d, 0.95);
    return b;
  };
  const white = mk((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  const pink = mk((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  });
  const brown = mk((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last;
    }
  });
  // Sparse decaying impulses — sparks, fire crackle, sizzle, debris.
  const crackle = mk((d) => {
    let env = 0;
    let sign = 1;
    for (let i = 0; i < d.length; i++) {
      if (Math.random() < 0.0016) {
        env = 0.3 + Math.random() * 0.7;
        sign = Math.random() < 0.5 ? -1 : 1;
      }
      env *= 0.985;
      d[i] = sign * env * (Math.random() * 0.6 + 0.4);
    }
  });
  return { white, pink, brown, crackle, ir: makeImpulse(ctx, 2.6, 2.3) };
}

// Stereo convolution impulse: pre-delay, a few early reflections, then a
// dense exponentially decaying tail that darkens over time.
function makeImpulse(ctx, seconds, rt60) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  const k = 6.9 / rt60;
  const early = [0.017, 0.029, 0.041, 0.053, 0.071, 0.089];
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const a = 0.85 * Math.exp(-t * 2.2) + 0.1; // damping: brighter early, darker late
      y += a * (Math.random() * 2 - 1 - y);
      const fadeIn = Math.min(1, t / 0.02);
      d[i] = y * Math.exp(-t * k) * fadeIn * 0.5;
    }
    for (let e = 0; e < early.length; e++) {
      const idx = pre + Math.floor(sr * (early[e] + (ch ? 0.0037 : 0) * (e % 3)));
      if (idx < len) d[idx] += (ch === e % 2 ? 0.5 : 0.32) * Math.pow(0.8, e);
    }
    // rough energy normalization so the send amounts mean something
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * d[i];
    const g = 0.6 / Math.sqrt(sum);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return ir;
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) {
    const g = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

function makeCurves() {
  const n = 2048;
  const build = (fn) => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    return c;
  };
  return {
    soft: build((x) => Math.tanh(2.5 * x) / Math.tanh(2.5)),
    hard: build((x) => Math.tanh(7 * x) / Math.tanh(7)),
    fold: build((x) => Math.sin(x * Math.PI * 1.5) * 0.9),
    // unity below 0.6, then a smooth knee into ~0.89 at full scale
    limit: build((x) => {
      const a = Math.abs(x);
      const y = a <= 0.6 ? a : 0.6 + 0.37 * Math.tanh((a - 0.6) / 0.37);
      return Math.sign(x) * y;
    }),
  };
}
