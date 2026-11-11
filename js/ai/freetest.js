// Live tests of the free providers, run from the AI settings ("Test the free models"): for each provider in play,
//   reach    its model list from this page (cross-origin allowed, key accepted), the best model chosen from it;
//   ping     a tiny exact JSON answer (is it alive, how fast);
//   chain    the app's real chapter request (prompts.js chapterPrompt, the same text Claude gets) on a short passage,
//            the answer parsed and put through the app's own checks (normalizeChain, qualityGate): how many steps, how
//            many problems (pasted text, repeats, steps that do not explain), how long it took.
// A provider that passes all three can write scrolls; the results also re-rank the router (a model that failed the
// chain test is skipped for a day). Each test spends one or two of the provider's requests.
import * as FREE from './free.js';
import { parseJSONLoose } from './claude.js';
import { chapterPrompt, qualityGate } from './prompts.js';
import { normalizeChain } from '../room/reader.js';

// a short original passage (written for this test): definitions, a law, a worked number, a limit of validity
export const PASSAGE = `Elastic springs and simple harmonic motion.
A spring that is stretched or compressed by a distance x from its natural length pulls back with a force proportional to x: F = -kx (Hooke's law). The constant k, the spring constant, is measured in newtons per metre; a stiff spring has a large k. The minus sign says the force always points back towards the natural length.
A mass m on such a spring, pulled aside and released, oscillates. Newton's second law gives m a = -k x, so the acceleration is proportional to the displacement and opposite to it: this is the definition of simple harmonic motion. The motion repeats with period T = 2π √(m/k), independent of how far the mass was pulled (the amplitude).
Worked example: a 0.50 kg mass on a spring with k = 200 N/m has T = 2π √(0.50/200) = 2π × 0.050 = 0.314 s, so it makes about 3.2 oscillations each second.
Energy moves between the spring and the mass: the stored energy ½ k x² is greatest at the turning points, where the mass is at rest, and the kinetic energy ½ m v² is greatest as the mass passes the natural length. Without friction their sum stays constant.
Hooke's law holds only while the spring is stretched within its elastic limit; beyond it the spring deforms permanently and the period formula no longer applies.`;
const SECTIONS = [{ id: 's1', title: 'Elastic springs and simple harmonic motion', text: PASSAGE }];

export async function testProvider(p, { signal, onStep } = {}) {
  const R = { id: p.id, name: p.name, reach: null, models: 0, model: null, ping: null, chain: null, verdict: 'fail' };
  const step = s => onStep && onStep({ ...R, step: s });
  // reach
  step('Reaching its model list…'); const t0 = performance.now();
  let L; try { L = await FREE.models(p, { fresh: true }); R.reach = { ok: true, ms: Math.round(performance.now() - t0) }; R.models = L.length; }
  catch (e) { R.reach = { ok: false, why: e && e.code === 'key' ? 'key rejected' : e && e.status ? 'HTTP ' + e.status : 'not reachable from this page (blocked or offline)' }; step('done'); return R; }
  if (!L.length) { R.reach.why = 'no writing models offered'; step('done'); return R; }
  // ping and chain: the best model first; if it is at its limit or broken, the next ones (up to three)
  for (const m of L.slice(0, 3)) {
    R.model = m.id; step('Ping ' + m.id + '…');
    try { const r = await FREE.call(p, m.id, 'Return exactly this JSON with the sum filled in: {"ok": true, "sum": <3 + 4>}', { signal, maxTokens: 400, timeoutMs: 45000 }); const v = parseJSONLoose(r.text); R.ping = { ok: !!v && v.ok === true && +v.sum === 7, ms: Math.round(r.ms) }; }
    catch (e) { R.ping = { ok: false, why: FREE.errText(e) }; if (e && e.code === 'cancelled') throw e; continue; }
    if (!R.ping.ok) continue;
    if (p.gapMs && !(FREE.settings().keys[p.id] || '').trim()) { step('Waiting ' + Math.round(p.gapMs / 1000) + ' s (its limit: one reply per ' + Math.round(p.gapMs / 1000) + ' s without a key)…'); await new Promise(r => setTimeout(r, p.gapMs)); }
    step('Writing a chain with ' + m.id + '…');
    try {
      const prompt = chapterPrompt({ book: 'A test of free models', chapter: 'Springs (test passage)', text: PASSAGE, depth: 'complete', sections: SECTIONS });
      const r = await FREE.call(p, m.id, prompt, { signal, timeoutMs: 240000 });
      let A; try { A = parseJSONLoose(r.text); } catch (e) { R.chain = { ok: false, why: 'answer was not JSON', ms: Math.round(r.ms), chars: r.text.length }; continue; }
      if (r.finish === 'length' || A._truncated) { R.chain = { ok: false, why: 'answer cut off at the output limit', ms: Math.round(r.ms) }; continue; }
      try { normalizeChain(A); } catch (e) { }
      const steps = (A.chain || []).length; let issues = [];
      try { const G = qualityGate(A, SECTIONS, []); issues = G.issues || []; } catch (e) { }
      const kinds = {}; issues.forEach(i => { kinds[i.kind] = (kinds[i.kind] || 0) + 1; });
      const ok = steps >= 3 && issues.length <= Math.max(2, steps * .3);
      R.chain = { ok, steps, issues: issues.length, kinds, ms: Math.round(r.ms), tokens: r.usage && r.usage.total_tokens, sample: (A.chain || []).slice(0, 2).map(s => s.title || s.claim || '').filter(Boolean) }; R.answer = A;
      if (ok) break;
    } catch (e) { R.chain = { ok: false, why: FREE.errText(e) }; if (e && e.code === 'cancelled') throw e; }
  }
  R.verdict = R.chain && R.chain.ok ? 'writes scrolls' : R.ping && R.ping.ok ? 'alive, weak at long JSON' : 'fail';
  step('done'); return R;
}
export async function testAll({ signal, onStep, only } = {}) {
  const list = FREE.active().filter(p => !only || only.includes(p.id)), out = [];
  // providers in parallel (each is its own quota), models within one provider in turn
  await Promise.all(list.map(async p => { try { out.push(await testProvider(p, { signal, onStep })); } catch (e) { if (e && e.code === 'cancelled') throw e; out.push({ id: p.id, name: p.name, verdict: 'fail', reach: { ok: false, why: String(e && (e.message || e.code) || e) } }); } }));
  return out.sort((a, b) => (b.chain && b.chain.ok) - (a.chain && a.chain.ok) || ((b.chain && b.chain.steps) || 0) - ((a.chain && a.chain.steps) || 0));
}
