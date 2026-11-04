// Evidence: grounds chains, diagrams and dioramas in the scholarly record.
// Inside claude.ai the page calls the viewer's own research connectors (the artifact `mcp` capability):
//   OpenAlex  — 250M+ works in every field, CC0 metadata, DOIs; also verifies citations (resolve_references)
//   Consensus — semantic search over peer-reviewed papers (plain-language questions)
//   PubMed    — biomedical and life-science literature
// These are passed to Claude as tools while it writes, so every non-trivial claim can carry sources that
// really exist. Afterwards, every cited reference is checked against OpenAlex and marked verified / not found.
// Outside claude.ai (or with no connector), prompts still ask for sources and they are shown as "unverified".
let MCP = null, SERVERS = new Set(), ready;
const DECLARED = { OpenAlex: ['search_works', 'resolve_references'], Consensus: ['search'], PubMed: ['search_articles', 'get_article_metadata'] };

export function initEvidence() {
  ready = (async () => {
    try {
      if (!(window.claude && claude.use)) return;
      MCP = await claude.use('mcp'); if (!MCP) return;
      const { servers } = await MCP.listTools().catch(() => ({ servers: [] }));
      // listTools lists declared servers even before consent (authStatus "unknown"); a server missing here has no connector
      for (const s of servers || []) if (DECLARED[s.server]) SERVERS.add(s.server);
    } catch (e) { MCP = null; }
  })();
  return ready;
}
export const evidenceServers = () => [...SERVERS];
export const evidenceAvailable = () => !!MCP && SERVERS.size > 0;

const ERR = {
  needs_reauth: s => `Reconnect ${s} in claude.ai Settings → Connectors.`,
  server_not_connected: s => `Add the ${s} connector in claude.ai Settings → Connectors to use it here.`,
  selection_required: s => `Choose which ${s} connector to use when claude.ai asks.`,
  not_in_manifest: s => `${s} is turned off for this page.`,
  approval_required: s => `${s} needs your approval for this page.`,
  blocked_by_policy: s => `Your organisation blocks ${s} here.`,
  server_unavailable: s => `${s} is not answering right now.`,
};
export const evidenceErr = (e, s) => (ERR[e && e.code] ? ERR[e.code](s || (e && e.server) || 'the connector') : (e && e.message) || 'The connector failed.');

async function call(server, tool, input) {
  await ready;
  if (!MCP || !SERVERS.has(server)) throw { code: 'server_not_connected', server };
  try { return (await MCP.callTool(server, tool, input)).payload; }
  catch (e) { if (e && e.retryable) { await new Promise(r => setTimeout(r, Math.min(e.retryAfterMs || 1500, 8000) * (0.8 + Math.random() * 0.4))); return (await MCP.callTool(server, tool, input)).payload; } throw e; }
}
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const doiUrl = d => d ? (String(d).startsWith('http') ? d : 'https://doi.org/' + String(d).replace(/^doi:/i, '')) : '';

// ---- searches, each returning small, uniform records ----
export async function searchOpenAlex(query, { from_year, limit = 6 } = {}) {
  const p = await call('OpenAlex', 'search_works', { query: cut(query, 400), limit, include_abstracts: true, ...(from_year ? { from_year } : {}) });
  return ((p && p.results) || []).map(w => ({ title: w.title, year: w.year, authors: (w.authors || []).slice(0, 3).map(a => String(a).replace(/\s*\(.*\)$/, '')).join('; '), venue: w.venue || '', doi: w.doi || '', url: w.doi ? doiUrl(w.doi) : w.openalex_url, cited_by: w.cited_by_count, abstract: cut(w.abstract, 450), source: 'OpenAlex' }));
}
export async function searchConsensus(query) {
  const p = await call('Consensus', 'search', { query: cut(query, 480) });
  const text = typeof p === 'string' ? p : JSON.stringify(p);
  // Consensus answers in numbered markdown: [n] [Title](url) (Authors, Year, N citations, Journal)\n abstract
  const out = []; const re = /\[(\d+)\]\s*\[([^\]]+)\]\(([^)]+)\)\s*\(([^)]*)\)\s*\n([\s\S]*?)(?=\n\[\d+\]\s*\[|$)/g; let m;
  while ((m = re.exec(text)) && out.length < 8) { const meta = m[4].split(','); const year = (m[4].match(/\b(1[89]|20)\d\d\b/) || [])[0]; out.push({ title: m[2], url: m[3], authors: (meta[0] || '').trim(), year: year ? +year : null, venue: (meta[meta.length - 1] || '').trim(), abstract: cut(m[5].trim(), 450), source: 'Consensus' }); }
  return out.length ? out : [{ note: cut(text, 3000), source: 'Consensus' }];
}
export async function searchPubMed(query) {
  const p = await call('PubMed', 'search_articles', { query: cut(query, 300), max_results: 5 });
  const ids = (p && p.pmids) || []; if (!ids.length) return [];
  const meta = await call('PubMed', 'get_article_metadata', { pmids: ids.slice(0, 5) });
  const arr = Array.isArray(meta) ? meta : (meta && (meta.articles || meta.results)) || [];
  // shape (observed): {articles:[{identifiers:{pmid,doi}, title, abstract, doi, journal:{title}, authors:[{last_name,initials}], publication_date:{year}}]}
  return arr.map(a => { const id = a.identifiers || {}; const doi = a.doi || id.doi || ''; const pmid = id.pmid || a.pmid; return { title: a.title, year: +((a.publication_date && a.publication_date.year) || 0) || null, authors: (a.authors || []).slice(0, 3).map(x => typeof x === 'string' ? x : [x.last_name, x.initials].filter(Boolean).join(' ')).join('; '), venue: (a.journal && (a.journal.title || a.journal)) || '', doi, pmid, url: doi ? doiUrl(doi) : 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/', abstract: cut(a.abstract, 450), source: 'PubMed (cite with DOI)' }; });
}

// ---- tools handed to Claude while it writes (sample `tools`) ----
export function evidenceTools() {
  const T = [];
  if (SERVERS.has('OpenAlex')) T.push({ name: 'search_literature', description: 'Search OpenAlex (250M scholarly works, every field: maths, physics, chemistry, biology, economics, history…). Returns title, year, authors, venue, DOI, citation count and abstract. Use it to find the textbook, review or original paper behind a definition, law, constant or data value.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'keywords or a short phrase' }, from_year: { type: 'integer' } }, required: ['query'] }, execute: i => searchOpenAlex(i.query, i) });
  if (SERVERS.has('Consensus')) T.push({ name: 'search_evidence', description: 'Semantic search over peer-reviewed papers for a plain-language research question ("how large is global land evaporation?"). Returns ranked papers with abstracts. Use it for empirical claims and measured values.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, execute: i => searchConsensus(i.query) });
  if (SERVERS.has('PubMed')) T.push({ name: 'search_biomedical', description: 'Search PubMed (medicine, physiology, molecular and cell biology, pharmacology only). Returns articles with DOIs and abstracts.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, execute: i => searchPubMed(i.query) });
  return T;
}
export const EVIDENCE_RULES = `GROUNDING. Tools that search the scholarly record may be available (search_literature, search_evidence, search_biomedical). When they are:
- Before writing, search for the part's central laws, definitions and any numbers you will state or plot (2–6 searches; one idea per query).
- Give each non-trivial step 1–3 "sources" you actually saw in a tool result or know with certainty (canonical textbooks, standards such as SI/CODATA/IUPAC, review articles, the original paper). Copy title, year and DOI exactly from the result. NEVER invent a DOI or a title; if unsure, leave "doi" empty and say so in "note".
- Measured values (constants, fluxes, prices, rates) must come from a source and say which. Data in a diagram cites its source in the demo's "source" field.
- Where sources disagree, say so in "note" and give the range.
When no tool is available, cite only works you are certain exist and leave "doi" empty unless you are sure of it.`;

// ---- verification: check every cited reference against OpenAlex ----
export function collectSources(A) {
  const out = []; const add = s => { if (s && (s.doi || s.title)) out.push(s); };
  (A.references || []).forEach(add);
  (A.chain || []).forEach(st => { (st.sources || []).forEach(add); (st.extra || []).forEach(e => add(e && e.source)); (st.demos || []).forEach(d => d && d.source && typeof d.source === 'object' && add(d.source)); });
  return out;
}
export async function verifySources(A, onProgress) {
  const all = collectSources(A).filter(s => s.verified === undefined); if (!all.length) return { checked: 0, ok: 0 };
  if (!SERVERS.has('OpenAlex')) throw { code: 'server_not_connected', server: 'OpenAlex' };
  let ok = 0;
  for (let i = 0; i < all.length; i += 25) {
    const batch = all.slice(i, i + 25);
    const refs = batch.map(s => s.doi ? String(s.doi).replace(/^https?:\/\/doi\.org\//i, '') : cut([s.authors, s.year ? '(' + s.year + ')' : '', s.title].filter(Boolean).join(' '), 580));
    const p = await call('OpenAlex', 'resolve_references', { references: refs });
    // shape (observed): {summary, results:[{input, match:"exact|likely|uncertain|none", matched_on, work:{id,doi,title,year,venue,cited_by_count,openalex_url,authors}, note}]}
    const res = (p && p.results) || [];
    batch.forEach((s, j) => {
      const r = res[j] || {}; const w = r.work || null; const conf = String(r.match || 'none').toLowerCase();
      s.check = conf; s.verified = !!(w && (conf === 'exact' || conf === 'likely'));
      if (r.note) s.checkNote = r.note;
      if (w && conf !== 'none') {
        s.openalex = w.openalex_url || (w.id ? 'https://openalex.org/' + w.id : '');
        if (s.verified) { ok++; if (!s.doi && w.doi) s.doi = w.doi; if (!s.year && w.year) s.year = w.year; if (!s.url) s.url = s.doi ? doiUrl(s.doi) : s.openalex; if (w.cited_by_count != null) s.cited_by = w.cited_by_count; }
        if (w.title && (conf !== 'exact' || matched_on_doi(r) && norm(w.title) !== norm(s.title))) s.matched = w.title + (w.year ? ' (' + w.year + ')' : '');
      }
    });
    onProgress && onProgress(Math.min(all.length, i + 25), all.length);
  }
  return { checked: all.length, ok };
}
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const matched_on_doi = r => r.matched_on === 'doi';
export { doiUrl };
