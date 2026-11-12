// What the AI is doing, how far it has got, and a Stop button: one small panel for every request the app makes.
//
// A job is one thing the reader asked for (analyse a part, write a sub-scroll, build a diorama, test the models). It
// has named stages (a progress bar through them), a live status line (which model is writing, what it waits for), the
// time it has taken, and a Stop that aborts every request inside it. A request made outside any job (askJSON on its
// own) shows as a small job of its own. Several jobs stack; a finished one leaves its last line for a moment.
import { el } from '../util.js';

const JOBS = new Set(); let box = null;
const anySignal = sigs => { sigs = sigs.filter(Boolean); if (sigs.length < 2) return sigs[0]; if (AbortSignal.any) return AbortSignal.any(sigs); const c = new AbortController(); sigs.forEach(s => s.aborted ? c.abort() : s.addEventListener('abort', () => c.abort(), { once: true })); return c.signal; };
const fmt = ms => ms < 60000 ? Math.round(ms / 1000) + ' s' : Math.floor(ms / 60000) + ' min ' + String(Math.round(ms / 1000) % 60).padStart(2, '0') + ' s';

function panel() {
  if (box && box.isConnected) return box;
  box = el('div', { class: 'ai-activity', role: 'status', 'aria-live': 'polite' }); document.body.append(box); return box;
}
function draw(J) {
  if (!J.row) {
    J.bar = el('div', { class: 'aa-fill' }); J.line = el('div', { class: 'aa-line' }); J.time = el('span', { class: 'aa-time' }); J.stageEl = el('span', { class: 'aa-stage' });
    J.stopBtn = el('button', { class: 'aa-stop', type: 'button', text: 'Stop', title: 'Stop this request (what is already written is kept)', onclick: () => J.stop() });
    J.row = el('div', { class: 'aa-job' }, [el('div', { class: 'aa-head' }, [el('b', { class: 'aa-label', text: J.label }), J.stageEl, J.time, J.stopBtn]), el('div', { class: 'aa-track' + (J.stages ? '' : ' indet') }, [J.bar]), J.line]);
    panel().append(J.row);
  }
  const n = J.stages ? J.stages.length : 0, i = Math.max(0, J.si);
  const frac = J.frac != null ? J.frac : n ? (i + (J.sub || 0)) / n : null;
  if (frac != null) { J.bar.style.width = Math.round(Math.min(1, frac) * 100) + '%'; J.row.querySelector('.aa-track').classList.remove('indet'); }
  J.stageEl.textContent = n ? `${Math.min(i + 1, n)} of ${n}: ${J.stageNames[i] || J.stages[i]}` : '';
  J.line.textContent = J.text || '';
}
const tick = setInterval(() => { for (const J of JOBS) if (J.time) J.time.textContent = fmt(Date.now() - J.at); }, 1000);
void tick;

// start a job: { label, stages: ['chain', …], names: {chain: 'writing the steps', …}, signal }
export function startJob(label, { stages = null, names = {}, signal = null } = {}) {
  const ctl = new AbortController();
  const J = { label, stages, stageNames: stages ? stages.map(s => names[s] || s) : [], si: 0, sub: 0, frac: null, text: '', at: Date.now(), ctl, signal: anySignal([ctl.signal, signal]),
    status(t) { if (t) { J.text = String(t); draw(J); } },
    stage(s, sub = 0) { if (!J.stages) return; const k = typeof s === 'number' ? s : J.stages.indexOf(s); if (k >= 0) { J.si = k; J.sub = sub; draw(J); } },
    progress(f) { J.frac = f; draw(J); },
    stop() { ctl.abort(); J.text = 'Stopping…'; J.stopBtn.disabled = true; draw(J); },
    end(final) { if (!JOBS.has(J)) return; JOBS.delete(J); if (J.row) { if (J.stages) J.bar.style.width = '100%'; J.text = final || (ctl.signal.aborted ? 'Stopped.' : 'Done.'); J.line.textContent = J.text; J.stopBtn.remove(); J.row.classList.add('ended'); setTimeout(() => { J.row && J.row.remove(); }, ctl.signal.aborted ? 2500 : 4000); } } };
  JOBS.add(J); draw(J); return J;
}
// the job a request belongs to: the most recent open one (a request made inside an analysis shows in that analysis)
export const currentJob = () => { let last = null; for (const J of JOBS) last = J; return last; };
export const anyOf = anySignal;
export const activeJobs = () => JOBS.size;
