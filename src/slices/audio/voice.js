// Voice: one playing sound effect. Recipes stack layers onto it (tones,
// filtered noise, FM metal, waveshaped drive); the voice tracks every source
// and its end time so the manager can steal or clean it up.
//
// Times (`at`, `a`, `hold`, `dur`) are seconds relative to the voice start.
// Frequencies are multiplied by the voice pitch.

export class Voice {
  constructor(eng, id, t0, pitch) {
    this.eng = eng;
    this.ctx = eng.ctx;
    this.id = id;
    this.t0 = t0;
    this.p = pitch;
    this.out = this.ctx.createGain();
    this.srcs = [];
    this.extra = []; // nodes after `out` (spatial chain, sends) to disconnect
    this.end = t0;
    this.dead = false;
    this.nyq = this.ctx.sampleRate * 0.46;
  }

  hz(f) {
    return Math.max(12, Math.min(this.nyq, f * this.p));
  }

  _track(src, stopAt) {
    src.start(Math.max(this.t0, stopAt.start));
    src.stop(stopAt.stop);
    this.srcs.push(src);
    if (stopAt.stop > this.end) this.end = stopAt.stop;
  }

  // Attack/hold/exponential-decay envelope on a GainNode; returns end time.
  _env(g, at, a, hold, dur, vol) {
    const t = this.t0 + at;
    const p = g.gain;
    // default to silence: a float start time can land a sample before the
    // first automation event, which would otherwise pass one sample at gain 1
    p.value = 0;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(vol, t + a);
    if (hold > 0) p.setValueAtTime(vol, t + a + hold);
    const e = t + a + hold + dur;
    p.exponentialRampToValueAtTime(0.0001, e);
    p.setValueAtTime(0, e + 0.002);
    return e + 0.01;
  }

  _sweep(param, f, f2, at, sweep) {
    const t = this.t0 + at;
    param.setValueAtTime(this.hz(f), t);
    if (f2 !== undefined && f2 !== f) param.exponentialRampToValueAtTime(this.hz(f2), t + sweep);
  }

  // Optional static filter in front of `dest`.
  _chain(node, o, dest) {
    let head = node;
    if (o.shape) {
      const ws = this.ctx.createWaveShaper();
      ws.curve = this.eng.curves[o.shape];
      head.connect(ws);
      head = ws;
    }
    if (o.lp || o.hp || o.bp) {
      const f = this.ctx.createBiquadFilter();
      f.type = o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass';
      this._sweep(f.frequency, o.lp || o.hp || o.bp, o.lp2 || o.hp2 || o.bp2, o.at || 0, o.fsweep || o.dur || 0.1);
      f.Q.value = o.q ?? (o.bp ? 2 : 0.7);
      head.connect(f);
      head = f;
    }
    head.connect(dest);
  }

  // Oscillator layer with pitch sweep, optional vibrato, filter and drive.
  tone(o) {
    const { type = 'sine', f = 440, f2, at = 0, a = 0.002, hold = 0, dur = 0.1, vol = 0.3, detune = 0, vib, curve } = o;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    if (detune) osc.detune.value = detune;
    const sweep = o.sweep ?? a + hold + dur;
    const t = this.t0 + at;
    if (curve === 'lin' && f2 !== undefined) {
      osc.frequency.setValueAtTime(this.hz(f), t);
      osc.frequency.linearRampToValueAtTime(this.hz(f2), t + sweep);
    } else {
      this._sweep(osc.frequency, f, f2, at, sweep);
    }
    const g = ctx.createGain();
    const end = this._env(g, at, a, hold, dur, vol);
    osc.connect(g);
    this._chain(g, o, o.dest || this.out);
    this._track(osc, { start: t, stop: end });
    if (vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = vib.rate;
      const lg = ctx.createGain();
      lg.gain.value = vib.depth * this.p;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      this._track(lfo, { start: t, stop: end });
    }
    return g;
  }

  // Looping pre-rendered noise from a random offset, filtered and enveloped.
  noise(o) {
    const { color = 'white', at = 0, a = 0.001, hold = 0, dur = 0.1, vol = 0.3, type, f, f2, q, rate = 1 } = o;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    const buf = this.eng.buffers[color];
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    let head = src;
    if (type) {
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      this._sweep(flt.frequency, f, f2, at, o.sweep ?? a + hold + dur);
      flt.Q.value = q ?? (type === 'bandpass' ? 1.2 : 0.7);
      src.connect(flt);
      head = flt;
    }
    const g = ctx.createGain();
    const end = this._env(g, at, a, hold, dur, vol);
    head.connect(g);
    g.connect(o.dest || this.out);
    const t = this.t0 + at;
    src.start(t, Math.random() * (buf.duration - 0.2));
    src.stop(end);
    this.srcs.push(src);
    if (end > this.end) this.end = end;
    return g;
  }

  // Two-operator FM — metallic rings, bells, electric buzz.
  fm(o) {
    const { f = 800, ratio = 1.41, index = 2, index2, at = 0, a = 0.001, hold = 0, dur = 0.2, vol = 0.2, type = 'sine' } = o;
    const ctx = this.ctx;
    const t = this.t0 + at;
    const car = ctx.createOscillator();
    car.type = type;
    this._sweep(car.frequency, f, o.f2, at, o.sweep ?? a + hold + dur);
    const mod = ctx.createOscillator();
    this._sweep(mod.frequency, f * ratio, o.f2 ? o.f2 * ratio : undefined, at, o.sweep ?? a + hold + dur);
    const mg = ctx.createGain();
    const depth = this.hz(f) * ratio * index;
    mg.gain.setValueAtTime(depth, t);
    if (index2 !== undefined) mg.gain.exponentialRampToValueAtTime(Math.max(0.01, this.hz(f) * ratio * index2), t + a + hold + dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    const end = this._env(g, at, a, hold, dur, vol);
    car.connect(g);
    this._chain(g, o, o.dest || this.out);
    this._track(car, { start: t, stop: end });
    this._track(mod, { start: t, stop: end });
    return g;
  }

  // A shared filter/drive stage that several layers can feed (`dest`).
  filter(type, f, q = 0.7, f2, sweep = 0.2, at = 0) {
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    this._sweep(flt.frequency, f, f2, at, sweep);
    flt.connect(this.out);
    return flt;
  }

  shaper(name = 'soft', dest = this.out, pre = 1) {
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.eng.curves[name];
    if (pre !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = pre;
      g.connect(ws);
      ws.connect(dest);
      return g;
    }
    ws.connect(dest);
    return ws;
  }

  // Amplitude tremolo applied to a destination gain (e.g. charge-up throb).
  tremolo(gainNode, rate, depth, at = 0, dur = 1, rate2) {
    const lfo = this.ctx.createOscillator();
    const t = this.t0 + at;
    lfo.frequency.setValueAtTime(rate, t);
    if (rate2) lfo.frequency.exponentialRampToValueAtTime(rate2, t + dur);
    const lg = this.ctx.createGain();
    lg.gain.value = depth;
    lfo.connect(lg);
    lg.connect(gainNode.gain);
    this._track(lfo, { start: t, stop: t + dur });
  }

  // Hard stop with a short fade (voice stealing).
  kill(now) {
    if (this.dead) return;
    this.dead = true;
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.025);
    for (const s of this.srcs) {
      try { s.stop(now + 0.03); } catch (e) { /* already stopped */ }
    }
    this.end = Math.min(this.end, now + 0.05);
  }

  disconnect() {
    this.out.disconnect();
    for (const n of this.extra) n.disconnect();
    this.srcs.length = 0;
    this.extra.length = 0;
  }
}
