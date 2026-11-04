// Sound: procedural ambience and interaction effects, synthesised with WebAudio (no audio files to download).
// Everything is made from a few noise buffers and oscillators, so it costs almost nothing and works offline.
//
//   sfx.play(name, {gain, pitch, x})   one-shot effect; x in 0..1 pans it left↔right (screen position)
//   sfx.ambience(kind, {rain, wind})   cross-fades to a looping bed: 'library' | 'room' | 'studio' | 'outdoor' |
//                                      'ocean' | 'space' | 'micro' | 'lab' | null
//   sfx.forEvent(text, x)              picks an effect from an event sentence (bounce → clack, crystal → chime, …)
//   sfx.setRain(0..1), sfx.setWind(0..1)  live weather layers for outdoor beds
// The context starts on the first user gesture (browsers require it). Mute and volume are remembered.
const KEY = 'scriptorium.sound';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(load(), o))); } catch (e) { } };

class Sound {
  constructor() {
    const P = load(); this.muted = !!P.muted; this.vol = P.vol ?? .6; this.ctx = null; this.amb = null; this.want = null; this.rain = 0; this.wind = 0;
    // the context starts on a gesture; if the browser keeps it suspended (autoplay policy, a sandboxed frame) the next
    // gestures try to resume it, and the listeners go only once it really runs
    const start = () => { this.init(); const c = this.ctx; if (c && c.state === 'suspended') { try { c.resume().catch(() => { }); } catch (e) { } } if (!c || c.state === 'running' || this._tries++ > 20) { removeEventListener('pointerdown', start, true); removeEventListener('keydown', start, true); } };
    this._tries = 0;
    addEventListener('pointerdown', start, true); addEventListener('keydown', start, true);
  }
  init() {
    if (this.ctx || this.failed) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    let c; try { c = new AC(); } catch (e) { this.failed = true; console.warn('Sound is unavailable here:', e.message); return; }   // too many contexts, blocked by policy
    this.ctx = c;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(c.destination);
    // a gentle room so dry synth sounds sit in a space (short noise-burst impulse response)
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(1.6, 2.8); this.wet = c.createGain(); this.wet.gain.value = .22; this.verb.connect(this.wet); this.wet.connect(this.master);
    this.fx = c.createGain(); this.fx.connect(this.master); this.fx.connect(this.verb);
    this.bed = c.createGain(); this.bed.gain.value = .55; this.bed.connect(this.master);
    const n = c.sampleRate * 4; this.white = c.createBuffer(1, n, c.sampleRate); this.pink = c.createBuffer(1, n, c.sampleRate); this.brown = c.createBuffer(1, n, c.sampleRate);
    const w = this.white.getChannelData(0), pk = this.pink.getChannelData(0), br = this.brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1; w[i] = x;
      b0 = .99886 * b0 + x * .0555179; b1 = .99332 * b1 + x * .0750759; b2 = .969 * b2 + x * .153852; b3 = .8665 * b3 + x * .3104856; b4 = .55 * b4 + x * .5329522; b5 = -.7616 * b5 - x * .016898;
      pk[i] = (b0 + b1 + b2 + b3 + b4 + b5 + x * .5362) * .11; last = (last + .02 * x) / 1.02; br[i] = last * 3.5;
    }
    if (this.want) { const k = this.want; this.want = null; this.ambience(k.kind, k.opts); }
  }
  impulse(sec, decay) { const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
  setMuted(m) { this.muted = m; save({ muted: m }); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, .05); this.syncBtn(); }
  setVolume(v) { this.vol = v; save({ vol: v }); if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .05); }
  // ---------- building blocks ----------
  src(buf, loop = false) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; if (loop) s.loopStart = Math.random(); return s; }
  out(x, gain = 1) { const c = this.ctx, g = c.createGain(); g.gain.value = gain; if (x == null || !c.createStereoPanner) { g.connect(this.fx); return g; } const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (x - .5) * 1.6)); g.connect(p); p.connect(this.fx); return g; }
  env(g, t, a, d, peak = 1) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
  noiseHit(o, { buf = 'white', type = 'bandpass', f = 1200, q = 1, a = .002, d = .12, gain = .5, x, f2 } = {}) {
    const c = this.ctx, t = c.currentTime, s = this.src(this[buf]), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d); fl.Q.value = q;
    s.connect(fl); fl.connect(g); g.connect(o || this.out(x)); this.env(g, t, a, d, gain); s.start(t, Math.random() * 3); s.stop(t + a + d + .05);
  }
  tone(o, { type = 'sine', f = 440, f2, a = .005, d = .3, gain = .3, x, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay, os = c.createOscillator(), g = c.createGain();
    os.type = type; os.frequency.setValueAtTime(f, t); if (f2) os.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    os.connect(g); g.connect(o || this.out(x)); this.env(g, t, a, d, gain); os.start(t); os.stop(t + a + d + .05);
  }
  // ---------- one-shot effects ----------
  play(name, opts = {}) {
    if (!this.ctx || this.muted) return; if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime; this._last = this._last || {}; if (now - (this._last[name] || -1) < .045) return; this._last[name] = now;   // never machine-gun one sound
    const x = opts.x, k = opts.gain ?? 1, p = opts.pitch ?? 1, O = this.out(x, k);
    switch (name) {
      case 'click': this.noiseHit(O, { f: 3200 * p, q: 2, d: .03, gain: .25 }); break;
      case 'hover': this.tone(O, { f: 1800 * p, d: .04, gain: .03 }); break;
      case 'paper': for (let i = 0; i < 7; i++) setTimeout(() => this.noiseHit(O, { f: 2500 + Math.random() * 3000, q: .8, d: .05 + Math.random() * .08, gain: .18 + Math.random() * .12 }), i * (35 + Math.random() * 45)); this.noiseHit(O, { buf: 'pink', type: 'highpass', f: 1500, d: .45, a: .08, gain: .12 }); break;
      case 'unroll': this.noiseHit(O, { buf: 'pink', type: 'bandpass', f: 1800, f2: 900, q: .7, a: .15, d: .6, gain: .25 }); this.play('paper', { x, gain: k * .8 }); break;
      case 'wood': this.tone(O, { type: 'triangle', f: 180 * p, f2: 120 * p, d: .12, gain: .35 }); this.noiseHit(O, { f: 900 * p, q: 3, d: .06, gain: .25 }); break;
      case 'step': this.noiseHit(O, { buf: 'pink', type: 'lowpass', f: 420 * p, d: .09, gain: .22 * k }); this.noiseHit(O, { f: 3000, q: 4, d: .015, gain: .05 }); break;
      case 'door': this.tone(O, { type: 'sawtooth', f: 70, f2: 55, a: .05, d: .5, gain: .08 }); this.noiseHit(O, { buf: 'brown', type: 'lowpass', f: 300, a: .02, d: .5, gain: .5 }); break;
      case 'whoosh': this.noiseHit(O, { buf: 'pink', type: 'bandpass', f: 300, f2: 2400, q: .9, a: .18, d: .35, gain: .35 }); break;
      case 'cut': this.noiseHit(O, { buf: 'pink', type: 'bandpass', f: 1600, f2: 500, q: .7, a: .03, d: .18, gain: .08 }); break;
      case 'clack': this.noiseHit(O, { f: 2600 * p, q: 6, d: .05, gain: .45 }); this.tone(O, { type: 'triangle', f: 900 * p, d: .07, gain: .15 }); break;
      case 'thud': this.tone(O, { f: 90 * p, f2: 50, d: .25, gain: .5 }); this.noiseHit(O, { buf: 'brown', type: 'lowpass', f: 200, d: .2, gain: .5 }); break;
      case 'tick': this.noiseHit(O, { f: 4200 * p, q: 8, d: .02, gain: .2 }); break;
      case 'chime': [1, 2.76, 5.4].forEach((m, i) => this.tone(O, { f: 1320 * p * m, d: 1.4 - i * .35, gain: .09 / (i + 1), delay: i * .004 })); break;
      case 'glass': [1, 2.3, 3.9].forEach((m, i) => this.tone(O, { f: 2100 * p * m, d: .5 - i * .1, gain: .07 / (i + 1) })); break;
      case 'bubble': this.tone(O, { f: 300 * p, f2: 900 * p, a: .01, d: .09, gain: .22 }); break;
      case 'drip': this.tone(O, { f: 1400 * p, f2: 500 * p, a: .002, d: .08, gain: .2 }); this.tone(O, { f: 700 * p, d: .25, gain: .04, delay: .02 }); break;
      case 'pour': this.noiseHit(O, { buf: 'pink', type: 'bandpass', f: 900, q: 1.2, a: .1, d: .9, gain: .25 }); break;
      case 'boing': this.tone(O, { type: 'triangle', f: 220 * p, f2: 160 * p, d: .4, gain: .25 }); this.tone(O, { f: 440 * p, f2: 330 * p, d: .3, gain: .06 }); break;
      case 'zap': this.tone(O, { type: 'sawtooth', f: 1200 * p, f2: 180, d: .14, gain: .12 }); this.noiseHit(O, { f: 5000, q: 1, d: .08, gain: .2 }); break;
      case 'thunder': this.noiseHit(O, { buf: 'brown', type: 'lowpass', f: 380, f2: 90, a: .05, d: 3.2, gain: .9 }); this.noiseHit(O, { buf: 'white', type: 'lowpass', f: 1600, f2: 200, a: .005, d: .5, gain: .3 }); break;
      case 'fizz': for (let i = 0; i < 10; i++) setTimeout(() => this.tone(O, { f: 1500 + Math.random() * 2500, d: .03, gain: .05 }), i * 40 * Math.random() + i * 15); break;
      case 'snap': this.noiseHit(O, { f: 3800 * p, q: 3, d: .025, gain: .4 }); this.tone(O, { f: 520 * p, f2: 260 * p, d: .06, gain: .12 }); break;
      case 'hum': this.tone(O, { type: 'sine', f: 110 * p, a: .2, d: 1.2, gain: .08 }); break;
      case 'success': [523, 659, 784].forEach((f, i) => this.tone(O, { f, d: .5, gain: .07, delay: i * .09 })); break;
      case 'step-done': [659, 988].forEach((f, i) => this.tone(O, { f, d: .45, gain: .06, delay: i * .08 })); break;
      default: this.play('click', opts);
    }
  }
  // map an event sentence to an effect (models may also give ev.sound explicitly)
  forEvent(text, x) {
    const t = String(text || '').toLowerCase();
    const pick = [[/thunder|lightning/, 'thunder'], [/crystal|nucleat|redissolv|freez/, 'chime'], [/bubble|boil|gas evolves|effervesc/, 'bubble'], [/drip|drop|spout|overflow|spill|pour|flows? (in|out)/, 'drip'],
      [/collid|collision|bounce|hits?|impact|strikes|lands|wall/, 'clack'], [/spring|oscillat|turning point/, 'boing'], [/spark|charge|current|discharge|ion|electr|field/, 'zap'],
      [/bond (breaks|forms)|split|break|snap|cleav/, 'snap'], [/react|product|mix/, 'fizz'], [/glass|lens|focus|image/, 'glass'], [/pressure|barometer|mercury/, 'tick'], [/rain/, 'pour'], [/released|launch/, 'whoosh']];
    const m = pick.find(([re]) => re.test(t)); this.play(m ? m[1] : 'tick', { x, gain: .8 });
  }
  // ---------- ambience beds ----------
  ambience(kind, opts = {}) {
    if (!this.ctx) { this.want = { kind, opts }; return; }
    if (this.amb && this.amb.kind === kind) return;
    const c = this.ctx, t = c.currentTime, old = this.amb;
    if (old) { old.g.gain.setTargetAtTime(0, t, .6); setTimeout(() => { old.nodes.forEach(n => { try { n.stop ? n.stop() : 0; } catch (e) { } try { n.disconnect(); } catch (e) { } }); clearInterval(old.timer); }, 3000); }
    if (!kind) { this.amb = null; return; }
    const g = c.createGain(); g.gain.value = 0; g.connect(this.bed); g.gain.setTargetAtTime(1, t, .8);
    const nodes = [], layer = (buf, type, f, q, gain, lfo) => { const s = this.src(this[buf], true), fl = c.createBiquadFilter(), lg = c.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; lg.gain.value = gain; s.connect(fl); fl.connect(lg); lg.connect(g); s.start(); nodes.push(s, fl, lg);
      if (lfo) { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = lfo[0]; og.gain.value = lfo[1]; o.connect(og); og.connect(lfo[2] === 'gain' ? lg.gain : fl.frequency); o.start(); nodes.push(o, og); } return lg; };
    const A = { kind, g, nodes, timer: null };
    const every = (ms, fn) => { A.timer = setInterval(() => { if (!this.muted && document.visibilityState !== 'hidden') fn(); }, ms); };
    switch (kind) {
      case 'library': case 'room':   // a large quiet hall: low room tone, air, a far clock, an occasional creak or page
        layer('brown', 'lowpass', 160, .7, .35); layer('pink', 'bandpass', 600, .4, .025, [.07, 180]);
        every(1000, () => { this.tone(null, { f: 2400, d: .03, gain: .006, x: .2 }); if (Math.random() < .035) this.play(Math.random() < .5 ? 'paper' : 'wood', { gain: .12, x: Math.random() }); }); break;
      case 'studio': case 'lab':     // a workshop: soft mains hum and air handling
        layer('brown', 'lowpass', 220, .7, .25); layer('pink', 'bandpass', 900, .5, .015);
        { const o = c.createOscillator(), og = c.createGain(); o.frequency.value = 100; og.gain.value = .006; o.connect(og); og.connect(g); o.start(); nodes.push(o, og); } break;
      case 'outdoor':                // meadow: wind in grass, distant birds; rain and wind layers follow the model
        A.wind = layer('pink', 'bandpass', 500, .5, .06 + this.wind * .3, [.11, 260]); A.rain = layer('white', 'highpass', 2500, .5, this.rain * .25);
        every(1800, () => { if (Math.random() < .3 && this.rain < .3) { const f = 2600 + Math.random() * 1600; for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) this.tone(null, { f: f * (1 + Math.random() * .1), f2: f * 1.25, d: .07, gain: .012, delay: i * .11, x: Math.random() }); } if (this.rain > .2 && Math.random() < this.rain) this.play('drip', { gain: .2, x: Math.random(), pitch: .7 + Math.random() * .6 }); }); break;
      case 'ocean': layer('brown', 'lowpass', 500, .5, .5, [.08, .35, 'gain']); layer('pink', 'highpass', 1800, .5, .05, [.08, .04, 'gain']); break;
      case 'space': { const o1 = c.createOscillator(), o2 = c.createOscillator(), og = c.createGain(); o1.frequency.value = 55; o2.frequency.value = 55.4; og.gain.value = .03; o1.connect(og); o2.connect(og); og.connect(g); o1.start(); o2.start(); nodes.push(o1, o2, og); layer('brown', 'lowpass', 90, .7, .2); } break;
      case 'micro': layer('brown', 'lowpass', 300, .6, .3, [.3, 120]); every(700, () => { if (Math.random() < .3) this.play('bubble', { gain: .1, pitch: .6 + Math.random(), x: Math.random() }); }); break;
      default: layer('brown', 'lowpass', 200, .7, .25);
    }
    this.amb = A;
  }
  setRain(r) { this.rain = r; if (this.amb && this.amb.rain && this.ctx) this.amb.rain.gain.setTargetAtTime(r * .25, this.ctx.currentTime, .5); }
  setWind(w) { this.wind = w; if (this.amb && this.amb.wind && this.ctx) this.amb.wind.gain.setTargetAtTime(.06 + w * .3, this.ctx.currentTime, .5); }
  // ---------- the speaker button ----------
  button() {
    const b = document.createElement('button'); b.className = 'sound-btn glass'; b.type = 'button';
    b.onclick = () => { this.init(); this.setMuted(!this.muted); if (!this.muted) this.play('click'); };
    b.title = 'Sound on/off'; this.btn = b; this.syncBtn(); return b;
  }
  syncBtn() { if (!this.btn) return; this.btn.setAttribute('aria-pressed', String(!this.muted)); this.btn.setAttribute('aria-label', this.muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off');
    this.btn.innerHTML = this.muted ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8"/></svg>' : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>'; }
}
export const sfx = new Sound();
