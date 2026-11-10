// Evidence: grounds chains, diagrams and dioramas in the scholarly record.
// Inside claude.ai the page calls the viewer's own research connectors (the artifact `mcp` capability):
//   OpenAlex  — 250M+ works in every field, CC0 metadata, DOIs; also verifies citations (resolve_references)
//   Consensus — semantic search over peer-reviewed papers (plain-language questions)
//   PubMed    — biomedical and life-science literature
//   SciSpace  — 280M papers in every discipline, strong for humanities and social sciences (history, law, literature, education)
//   Hugging Face — arXiv-linked papers and library docs for computing, AI/ML, programming and graphics
//   ClinicalTrials.gov — registered trials (medicine, pharmacology, public health)
// These are passed to Claude as tools while it writes, so every non-trivial claim can carry sources that
// really exist. Afterwards, every cited reference is checked against OpenAlex and marked verified / not found.
// Outside claude.ai (or with no connector), prompts still ask for sources and they are shown as "unverified".
let MCP = null, SERVERS = new Set(), ready;
const DECLARED = { OpenAlex: ['search_works', 'resolve_references'], Consensus: ['search'], PubMed: ['search_articles', 'get_article_metadata'], SciSpace: ['search'], 'Hugging Face': ['hf_fs'], 'Clinical Trials': ['search_trials'], Firecrawl: ['firecrawl_scrape'] };

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

// SciSpace: {results:[{id,title,text:"YEAR · Authors · Venue\nTL;DR…\nAbstract…",url}]} (observed)
export async function searchSciSpace(query) {
  const q = /\?\s*$/.test(query) ? query : query + '?';
  const p = await call('SciSpace', 'search', { query: cut(q, 470) + ' limit:6' });
  return ((p && p.results) || []).slice(0, 6).map(r => { const head = String(r.text || '').split('\n')[0].split(' · '); const year = +(head[0] || '').trim() || null;
    return { title: r.title, year, authors: (head[1] || '').trim(), venue: (head[2] || '').trim(), url: r.url, abstract: cut(String(r.text || '').split('\n').slice(1).join(' ').replace(/^TL;DR:\s*/, ''), 450), source: 'SciSpace' }; });
}
// Hugging Face: hf_fs search over papers (arXiv) or docs. {results:[{status,result:{entries:[{title,description,url,arxiv_url,published_at}]}}]} (observed)
export async function searchComputing(query, scope = 'papers') {
  const p = await call('Hugging Face', 'hf_fs', { operations: [{ cmd: 'search', args: ['hf://' + (scope === 'docs' ? 'docs' : 'papers'), cut(query, 200), '--limit', '6'] }] });
  const ent = (((p && p.results) || [])[0] || {}).result; const E = (ent && ent.entries) || [];
  return E.map(e => ({ title: String(e.title || e.name || '').replace(/\s+/g, ' '), year: e.published_at ? +String(e.published_at).slice(0, 4) : null, authors: '', venue: e.arxiv_url ? 'arXiv' : 'Hugging Face', url: e.arxiv_url || e.url || '', abstract: cut(e.description, 450), source: 'Hugging Face' }));
}
export async function searchTrials(condition, intervention) {
  const p = await call('Clinical Trials', 'search_trials', { condition: cut(condition, 200), ...(intervention ? { intervention: cut(intervention, 120) } : {}), page_size: 5 });
  const S = (p && (p.items || p.studies || p.trials || p.results)) || [];   // observed: {items:[{nct_id,title,status,phase,conditions,interventions,sponsor,enrollment,start_date}]}
  return S.slice(0, 5).map(s => { const id = s.nct_id || s.nctId || (s.protocolSection && s.protocolSection.identificationModule && s.protocolSection.identificationModule.nctId) || '';
    return { title: s.title || s.brief_title || s.briefTitle || id, year: +String(s.start_date || s.startDate || '').slice(0, 4) || null, authors: s.sponsor || '', venue: 'ClinicalTrials.gov ' + (s.status || s.overall_status || ''), url: id ? 'https://clinicaltrials.gov/study/' + id : '', abstract: cut(s.brief_summary || s.summary || [[].concat(s.phase || []).join('/'), s.conditions && [].concat(s.conditions).join(', '), s.interventions && 'intervention: ' + [].concat(s.interventions).join(', '), s.enrollment && 'n = ' + s.enrollment].filter(Boolean).join(' · '), 400), source: 'ClinicalTrials.gov' }; });
}

// ---- how the best explainers show it: videos (lectures, animations, documentaries, game playthroughs), games,
// newsletters and films, through the viewer's Firecrawl connector and its catalogued providers (youtube-com,
// store-steampowered-com, substack-com, letterboxd-com). Used for the DESIGN of a diorama, motion figure or explanation
// (what mechanic, what view, what order), never as a source of facts; Reddit and Pinterest are left out: both refuse
// automated access, and the honest route to them is their own API through a connector of their own.
async function alex(provider, capability, options) {
  const p = await call('Firecrawl', 'firecrawl_scrape', { objective: 'Find how good explainers, documentaries and games show a concept, to design a clearer explanation', alexandria: { provider, capability, options } });
  const o = typeof p === 'string' ? JSON.parse(p) : p, L = o && ((o.data && o.data.alexandria) || o.alexandria), a = Array.isArray(L) ? L[0] : L;
  if (!a || a.error) throw new Error((a && a.error && a.error.message) || 'no result'); return a.data || {};
}
export async function searchVideos(query, kind = '') {
  const d = await alex('youtube-com', 'videos/search_videos', { query: cut(query + (kind === 'playthrough' ? ' playthrough' : kind === 'documentary' ? ' documentary' : ''), 160) });
  return (d.videos || []).slice(0, 8).map(v => ({ title: v.title, channel: v.channel_name, length: v.length_text, views: v.view_count_text, url: v.url, video_id: v.video_id, about: cut(v.description_snippet, 160) }));
}
export async function videoTranscript(video_id) { const d = await alex('youtube-com', 'videos/video_transcript', { video_id, language: 'en' }); return { title: d.title, url: d.url, text: cut(d.full_text, 7000) }; }
export async function searchGames(term) { const d = await alex('store-steampowered-com', 'games/search_games', { term: cut(term, 100) }); return (d.items || []).slice(0, 6).map(g => ({ name: g.name, appid: g.appid, url: g.store_url, metascore: g.metascore })); }
export async function searchNewsletter(publication, query) { const d = await alex('substack-com', 'newsletters/search', { publication, query: cut(query, 120) }); return (d.posts || []).slice(0, 6).map(p => ({ title: p.title, url: p.canonical_url || p.url || '', date: String(p.published_at || '').slice(0, 10), preview: cut(p.preview_text || p.description, 220) })); }
export async function searchFilms(query) { const d = await alex('letterboxd-com', 'films/search_films', { query: cut(query, 100) }); return (d.results || []).slice(0, 8).map(f => ({ title: f.name, year: f.year, url: f.url, directors: (f.directors || []).map(x => x.name).join(', ') })); }
export function inspirationTools() {
  if (!SERVERS.has('Firecrawl')) return [];
  return [
    { name: 'search_videos', description: 'Search YouTube for how the best explainers, lecturers and documentaries SHOW this idea, or (kind "playthrough") how a game makes a player feel it. Returns titles, channels, lengths and URLs. For design ideas only, never as a source of facts.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, kind: { type: 'string', enum: ['', 'documentary', 'playthrough'] } }, required: ['query'] }, execute: i => searchVideos(i.query, i.kind) },
    { name: 'video_transcript', description: 'The English transcript of one YouTube video (by video_id from search_videos), to see the order in which a good explanation reveals things.', inputSchema: { type: 'object', properties: { video_id: { type: 'string' } }, required: ['video_id'] }, execute: i => videoTranscript(i.video_id) },
    { name: 'search_games', description: 'Search the Steam store for games whose mechanics teach this idea (orbits, circuits, chemistry, economics…). Returns names and store URLs.', inputSchema: { type: 'object', properties: { term: { type: 'string' } }, required: ['term'] }, execute: i => searchGames(i.term) },
    { name: 'search_newsletter', description: 'Search one Substack newsletter (its publication name, e.g. "construction-physics") for essays explaining this idea.', inputSchema: { type: 'object', properties: { publication: { type: 'string' }, query: { type: 'string' } }, required: ['publication', 'query'] }, execute: i => searchNewsletter(i.publication, i.query) },
    { name: 'search_films', description: 'Search Letterboxd for documentaries or films about this idea (title, year, director).', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, execute: i => searchFilms(i.query) },
  ];
}
export const INSPIRATION_RULES = `DESIGN REFERENCES. Tools may show how the best explainers, documentaries and games present this idea (search_videos, video_transcript, search_games, search_newsletter, search_films). Use them, when available, before designing a diorama, a motion figure or the order of a hard derivation (1–3 searches): borrow the MECHANIC (the view, the order of reveals, the interaction, the analogy), never the words or images, and never treat them as sources of facts (facts come from the scholarly tools). Name a reference you drew on in the step's "note" as "design after <title>, <url>".`;
// ---- tools handed to Claude while it writes (sample `tools`) ----
export function evidenceTools() {
  const T = [];
  if (SERVERS.has('OpenAlex')) T.push({ name: 'search_literature', description: 'Search OpenAlex (250M scholarly works, every field: maths, physics, chemistry, biology, economics, history…). Returns title, year, authors, venue, DOI, citation count and abstract. Use it to find the textbook, review or original paper behind a definition, law, constant or data value.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'keywords or a short phrase' }, from_year: { type: 'integer' } }, required: ['query'] }, execute: i => searchOpenAlex(i.query, i) });
  if (SERVERS.has('Consensus')) T.push({ name: 'search_evidence', description: 'Semantic search over peer-reviewed papers for a plain-language research question ("how large is global land evaporation?"). Returns ranked papers with abstracts. Use it for empirical claims and measured values.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, execute: i => searchConsensus(i.query) });
  if (SERVERS.has('PubMed')) T.push({ name: 'search_biomedical', description: 'Search PubMed (medicine, physiology, molecular and cell biology, pharmacology only). Returns articles with DOIs and abstracts.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, execute: i => searchPubMed(i.query) });
  if (SERVERS.has('SciSpace')) T.push({ name: 'search_any_discipline', description: 'Search SciSpace (280M papers in every discipline). Best for the humanities and social sciences (history, philosophy, law, literature, linguistics, education, art) and as a second source anywhere. Write a full question.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, execute: i => searchSciSpace(i.query) });
  if (SERVERS.has('Hugging Face')) T.push({ name: 'search_computing', description: 'Search arXiv-linked papers (scope "papers") or library documentation (scope "docs") on Hugging Face: computer science, AI/ML, statistics software, programming, computer graphics.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, scope: { type: 'string', enum: ['papers', 'docs'] } }, required: ['query'] }, execute: i => searchComputing(i.query, i.scope) });
  T.push(...inspirationTools());
  if (SERVERS.has('Clinical Trials')) T.push({ name: 'search_clinical_trials', description: 'Search ClinicalTrials.gov registered trials by condition (and optional intervention). Medicine and pharmacology only.', inputSchema: { type: 'object', properties: { condition: { type: 'string' }, intervention: { type: 'string' } }, required: ['condition'] }, execute: i => searchTrials(i.condition, i.intervention) });
  return T;
}
export const EVIDENCE_RULES = `GROUNDING. Tools that search the scholarly record may be available (search_literature, search_evidence, search_biomedical, search_any_discipline, search_computing, search_clinical_trials). Pick by field: maths/physics/chemistry/earth science → search_literature + search_evidence; biology/medicine → add search_biomedical (trials: search_clinical_trials); humanities/social sciences → search_any_discipline + search_literature; computing/AI/programming/graphics → search_computing + search_literature. When they are:
- Before writing, search for the part's central laws, definitions and any numbers you will state or plot (2–6 searches; one idea per query).
- Give each non-trivial step 1–3 "sources" you actually saw in a tool result or know with certainty (canonical textbooks, standards such as SI/CODATA/IUPAC, review articles, the original paper). Copy title, year and DOI exactly from the result. NEVER invent a DOI or a title; if unsure, leave "doi" empty and say so in "note".
- Research like a scholar, not a keyword box: expand the concept into its neighbouring disciplines' terms; follow a key paper's citations backwards (the origin) and forwards (replications, reviews); extract exactly what a source does, not a summary; look for the same mechanism in another field (for an analogy, and say where it breaks); prefer evidence that something improves understanding or transfer over evidence that it is liked.
- Tag each source with "evidence": "effect" (a measured effect exists), "method" (a teaching method improved learning), "visual" (a visualisation improved understanding), "implementation" (it works technically) or "inspiration" (no evidence of effect). Never let inspiration stand in for evidence.
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
