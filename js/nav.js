// Navigation shared by the library hub and the book rooms.
// Two modes:
//  - "orbit": the overview mode — drag to orbit, wheel to dolly, WASD/arrows glide the view (camera + target together)
//  - "walk":  first-person, as a person of average height would see the room — eyes at 1.62 m, drag to turn the
//             head, WASD to walk at a human pace (default 1.4 m/s, the typical preferred walking speed), Shift to hurry,
//             a gentle head bob tied to the stride, inertia on start/stop, collisions with walls and furniture, and the
//             wheel (or holding the right mouse button) narrows the field of view like looking closely.
//             Space jumps: a standing jump of 0.45 m under g = 9.81 m/s² (take-off at √(2gh) ≈ 2.97 m/s, ~0.6 s in the
//             air), one jump per press and only from the floor (no double jumps), stopped under a low ceiling, with
//             little steering in the air; the landing bends the knees (a dip of up to 5 cm over ~0.3 s) with a footstep.
// The walking speed is adjustable for both modes and remembered in this browser.
import * as THREE from 'three';
import { el, clamp } from './util.js';
import { sfx } from './audio.js';

const KEY = 'scriptorium.view';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const save = o => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign(load(), o))); } catch (e) { } };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const EYE = 1.62, FOV_WALK = 68, JUMP_H = .45, GRAVITY = 9.81, HEAD = .12;

export class Navigator {
  constructor({ camera, controls, canvas, keys, bounds, obstacles, host, orbitFov }) {
    Object.assign(this, { camera, controls, canvas, keys, bounds, obstacles: obstacles || (() => []) });
    const P = load(); this.speed = +P.walkSpeed || 1.4; this.mode = P.navMode === 'walk' ? 'walk' : 'orbit';
    this.orbitFov = orbitFov || camera.fov; this.vel = V3(); this.yaw = 0; this.pitch = 0; this.bobT = 0; this.zoom = 0; this.zoomTarget = 0; this.needsSync = true;
    // first-person look: drag with the left button turns the head; right button held = look closely
    this.onDown = e => { if (this.mode !== 'walk') return; if (e.button === 2) { this.zoomTarget = 1; return; } this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; };
    this.onMove = e => { if (!this.drag || this.mode !== 'walk' || this.busy) return; const k = .0042 * (this.camera.fov / FOV_WALK); this.yaw = this.drag.yaw - (e.clientX - this.drag.x) * k; this.pitch = clamp(this.drag.pitch - (e.clientY - this.drag.y) * k, -1.35, 1.35); };
    this.onUp = e => { this.drag = null; if (e.button === 2) this.zoomTarget = 0; };
    this.onWheel = e => { if (this.mode !== 'walk') return; e.preventDefault(); this.zoomTarget = clamp(this.zoomTarget + Math.sign(e.deltaY) * -.12, 0, 1); };
    this.onCtx = e => { if (this.mode === 'walk') e.preventDefault(); };
    // Space in first person: a jump request (key repeat ignored; also keeps Space from pressing a focused button)
    this.jumpY = 0; this.vy = 0; this.air = false; this.dipT = -1; this.eyeY = EYE;
    this.onKey = e => { if (this.mode !== 'walk' || e.code !== 'Space' || (e.target && e.target.closest && e.target.closest('input,textarea,select'))) return; e.preventDefault(); if (!e.repeat && !this.busy) this.jumpReq = true; };
    addEventListener('keydown', this.onKey);
    canvas.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false }); canvas.addEventListener('contextmenu', this.onCtx);
    this.ui = this.buildUI(); host.append(this.ui);
    this.setMode(this.mode, true);
  }
  buildUI() {
    const lab = el('span', { class: 'nav-v', text: this.speed.toFixed(1) + ' m/s' });
    const sl = el('input', { type: 'range', min: .3, max: 4, step: .1, value: this.speed, 'aria-label': 'Movement speed', oninput: () => { this.speed = +sl.value; lab.textContent = this.speed.toFixed(1) + ' m/s'; save({ walkSpeed: this.speed }); } });
    this.modeBtns = ['orbit', 'walk'].map(m => el('button', { class: 'tog', 'aria-pressed': String(this.mode === m), text: m === 'orbit' ? 'Overview' : 'Walk (first person)', title: m === 'orbit' ? 'Drag to orbit, wheel to zoom, WASD to glide' : 'Eyes at human height: drag to look, WASD to walk, Shift to hurry, Space to jump, wheel or right button to look closely (V switches)', onclick: () => this.setMode(m) }));
    return el('div', { class: 'nav-box glass' }, [el('div', { class: 'row' }, this.modeBtns), el('label', { class: 'nav-speed' }, [el('span', { text: 'Speed' }), sl, lab])]);
  }
  setMode(m, initial) {
    this.mode = m; save({ navMode: m }); this.modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['orbit', 'walk'][i] === m)));
    const c = this.camera;
    this.jumpY = 0; this.vy = 0; this.air = false; this.dipT = -1; this.jumpReq = false;
    if (m === 'walk') { this.controls.enabled = false; this.syncFromCamera(); c.position.y = EYE; this.eyeY = EYE; }
    else {
      if (!initial) { const f = V3(); c.getWorldDirection(f); this.controls.target.copy(c.position).addScaledVector(f, 1.6); }
      c.fov = this.orbitFov; c.updateProjectionMatrix(); this.controls.enabled = true; this.controls.update();
    }
    this.canvasCursor();
  }
  canvasCursor() { this.canvas.style.cursor = this.mode === 'walk' ? 'grab' : ''; }
  syncFromCamera() { const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = clamp(e.x, -1.35, 1.35); this.needsSync = false; }
  toggle() { this.setMode(this.mode === 'walk' ? 'orbit' : 'walk'); }
  // busy: an animation owns the camera (opening a scroll, flying to a station, reading)
  update(dt, busy) {
    this.busy = busy; const k = this.keys, c = this.camera, B = this.bounds();
    if (busy) { this.needsSync = true; this.vel.set(0, 0, 0); this.jumpReq = false; if (this.air || this.jumpY) { this.jumpY = 0; this.vy = 0; this.air = false; } return; }
    if (this.mode === 'walk' && this.needsSync) { this.syncFromCamera(); }
    const f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), s = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
    const T = this._t || (this._t = { fwd: V3(), side: V3(), up: V3(0, 1, 0), step: V3(), p: V3() });   // reused every frame (no garbage while walking)
    const fwd = T.fwd; c.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); const side = T.side.crossVectors(fwd, T.up);
    const want = fwd.multiplyScalar(f).add(side.multiplyScalar(s)); if (want.lengthSq() > 0) want.normalize().multiplyScalar(this.speed * (k.shift ? 1.9 : 1));
    // inertia: humans accelerate over ~0.3 s and stop over ~0.2 s (in the air there is next to no steering)
    this.vel.lerp(want, 1 - Math.exp(-dt * (this.air ? .8 : want.lengthSq() ? 7 : 10)));
    const step = T.step.copy(this.vel).multiplyScalar(dt);
    if (this.mode === 'walk') {
      const p = T.p.copy(c.position).add(step); this.collide(p, B, .28); c.position.x = p.x; c.position.z = p.z;
      const v = this.air ? 0 : this.vel.length(); this.bobT += dt * (v > .05 ? 2 * Math.PI * (1.7 + v * .25) * .5 : 0);
      const bob = v > .05 ? Math.sin(this.bobT * 2) * .018 * clamp(v / 1.4, 0, 1.6) : 0;
      // a footstep each time the stride reaches its lowest point (soft on marble; louder when hurrying)
      const ph = Math.floor((this.bobT * 2 + Math.PI / 2) / (2 * Math.PI));   // one footstep per bob cycle (~2 per second at 1.4 m/s)
      if (v > .25 && ph !== this.stepPh) { this.stepPh = ph; sfx.play('step', { gain: clamp(v / 1.4, .4, 1.4), pitch: .9 + Math.random() * .2, x: .5 + (ph % 2 ? .08 : -.08) }); }
      this.jump(dt, B);
      this.eyeY += (EYE + bob - this.eyeY) * Math.min(1, dt * 10);
      c.position.y = this.eyeY + this.jumpY + this.dip(dt);
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 6);
      const fov = FOV_WALK - this.zoom * 38; if (Math.abs(c.fov - fov) > .01) { c.fov = fov; c.updateProjectionMatrix(); }
      c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else {
      if (step.lengthSq() > 0) { c.position.add(step); this.controls.target.add(step); }
      this.controls.update();
      const p = c.position; p.x = clamp(p.x, B.minX + .3, B.maxX - .3); p.z = clamp(p.z, B.minZ + .3, B.maxZ - .3); p.y = clamp(p.y, .4, B.h - .3);
      const t = this.controls.target; t.x = clamp(t.x, B.minX + .1, B.maxX - .1); t.z = clamp(t.z, B.minZ + .1, B.maxZ - .1);
    }
  }
  // the jump: a press on the floor starts it (none in the air: no double jumps); ballistic under GRAVITY; the head
  // (HEAD above the eyes) stops 0.15 m under the ceiling (B.h); on landing a knee dip and a footstep
  jump(dt, B) {
    if (this.jumpReq) { this.jumpReq = false; if (!this.air && this.jumpY === 0) { this.vy = Math.sqrt(2 * GRAVITY * JUMP_H); this.air = true; this.dipT = -1; } }
    if (!this.air) return;
    this.jumpY += this.vy * dt - .5 * GRAVITY * dt * dt; this.vy -= GRAVITY * dt;   // exact for constant g: the apex is 0.45 m at any frame rate
    const top = Math.max(0, (B.h || 99) - .15 - HEAD - EYE); if (this.jumpY > top) { this.jumpY = top; this.vy = Math.min(this.vy, 0); }
    if (this.jumpY <= 0) { const land = Math.abs(this.vy); this.jumpY = 0; this.vy = 0; this.air = false; this.dipT = 0; this.dipA = .05 * clamp(land / Math.sqrt(2 * GRAVITY * JUMP_H), .3, 1); sfx.play('step', { gain: 1.2 }); }
  }
  // the landing's knee dip: down and back up over 0.3 s (a quick bend, a slower rise)
  dip(dt) {
    if (this.dipT < 0) return 0; this.dipT += dt; const k = this.dipT / .3; if (k >= 1) { this.dipT = -1; return 0; }
    return -this.dipA * Math.sin(Math.PI * Math.pow(k, .7));
  }
  // keep a body of radius r inside the room and out of furniture boxes (resolve along the shallowest axis)
  collide(p, B, r) {
    p.x = clamp(p.x, B.minX + r, B.maxX - r); p.z = clamp(p.z, B.minZ + r, B.maxZ - r);
    for (const b of this.obstacles()) {
      if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r || b.min.y > 1.8) continue;
      const dx1 = p.x - (b.min.x - r), dx2 = (b.max.x + r) - p.x, dz1 = p.z - (b.min.z - r), dz2 = (b.max.z + r) - p.z, m = Math.min(dx1, dx2, dz1, dz2);
      if (m === dx1) p.x = b.min.x - r; else if (m === dx2) p.x = b.max.x + r; else if (m === dz1) p.z = b.min.z - r; else p.z = b.max.z + r;
    }
  }
  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel); this.canvas.removeEventListener('contextmenu', this.onCtx); removeEventListener('keydown', this.onKey); this.ui.remove();
  }
}
