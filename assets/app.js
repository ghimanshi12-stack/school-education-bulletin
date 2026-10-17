(function () {
  'use strict';

  const SECTIONS = [
    { id: 'all', label: 'All updates' },
    { id: 'govt', label: 'Central Government' },
    { id: 'news', label: 'News & Opinion' },
    { id: 'research', label: 'Research & Reports' },
    { id: 'global', label: 'Global' }
  ];
  const SECTION_BADGE = { govt: 'Central Government', news: 'News & Opinion', research: 'Research', global: 'Global' };
  const THEMES = [
    { id: 'ece', label: 'Early Childhood Education' },
    { id: 'fln', label: 'FLN' },
    { id: 'tech_ai', label: 'Technology & AI' },
    { id: 'secondary', label: 'Secondary Education' },
    { id: 'assessment', label: 'Assessments' },
    { id: 'budget_governance', label: 'Budgets & Governance' }
  ];
  const THEME_LABEL = Object.fromEntries(THEMES.map(t => [t.id, t.label]));
  const PAGE = 40;
  const DEFAULTS = { section: 'all', range: 7, q: '', shown: PAGE };

  const state = Object.assign({ themes: new Set() }, DEFAULTS);
  let items = [];

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- URL hash <-> state, so filtered views can be shared ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has('s')) state.section = p.get('s');
    if (p.has('t')) state.themes = new Set(p.get('t').split(',').filter(Boolean));
    if (p.has('r')) state.range = Number(p.get('r')) || 0;
    if (p.has('q')) state.q = p.get('q');
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (state.section !== 'all') p.set('s', state.section);
    if (state.themes.size) p.set('t', [...state.themes].join(','));
    if (state.range !== 7) p.set('r', state.range);
    if (state.q) p.set('q', state.q);
    const h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }
  function resetState() {
    Object.assign(state, DEFAULTS); state.themes.clear();
  }

  // ---------- Filtering ----------
  function matches(it, opts) {
    const o = Object.assign({ section: true, themes: true }, opts);
    if (o.section && state.section !== 'all' && it.section !== state.section) return false;
    if (state.range) {
      const cutoff = Date.now() - state.range * 86400000;
      if (new Date(it.published).getTime() < cutoff) return false;
    }
    if (o.themes && state.themes.size) {
      const th = it.themes || [];
      if (![...state.themes].some(t => th.includes(t))) return false;
    }
    if (state.q) {
      const hay = (it.title + ' ' + (it.blurb || '') + ' ' + (it.source || '')).toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  // ---------- Rendering ----------
  function renderTabs() {
    $('tabs').innerHTML = SECTIONS.map(s => {
      const n = items.filter(it => (s.id === 'all' || it.section === s.id) && matches(it, { section: false })).length;
      return `<button class="tab" role="tab" data-section="${s.id}" aria-selected="${state.section === s.id}">${esc(s.label)}<span class="n">${n}</span></button>`;
    }).join('');
  }

  function renderThemes() {
    $('themes').innerHTML = THEMES.map(t => {
      const n = items.filter(it => matches(it, { themes: false }) && (it.themes || []).includes(t.id)).length;
      return `<button type="button" class="chip" data-theme="${t.id}" aria-pressed="${state.themes.has(t.id)}">${esc(t.label)}<span class="n">${n}</span></button>`;
    }).join('');
    $('clear-themes').hidden = state.themes.size === 0;
  }

  function renderRange() {
    document.querySelectorAll('#range button').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.range) === state.range));
  }

  function dayLabel(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function card(it) {
    const time = new Date(it.published).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const tags = (it.themes || []).map(t => `<button type="button" class="tag" data-theme="${t}">${esc(THEME_LABEL[t] || t)}</button>`).join('');
    return `<article class="card" data-section="${esc(it.section)}">
      <div class="meta"><span class="badge">${esc(SECTION_BADGE[it.section] || '')}</span>
        <span>${esc(it.source || '')}</span><span>${time}</span></div>
      <h3><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>
      ${it.blurb ? `<p class="blurb">${esc(it.blurb)}</p>` : ''}
      <div class="foot"><div class="tags">${tags}</div><a class="read" href="${esc(it.url)}" target="_blank" rel="noopener">Read original ↗</a></div>
    </article>`;
  }

  function renderList() {
    const list = items.filter(it => matches(it));
    $('count').textContent = `${list.length} ${list.length === 1 ? 'update' : 'updates'}`;
    if (!list.length) {
      $('list').innerHTML = `<div class="empty">No updates match these filters. Try a wider date range or clear some themes.</div>`;
      return;
    }
    let html = '', lastDay = '';
    list.slice(0, state.shown).forEach(it => {
      const d = dayLabel(it.published);
      if (d !== lastDay) { html += `<h2 class="day">${esc(d)}</h2>`; lastDay = d; }
      html += card(it);
    });
    if (list.length > state.shown) html += `<button type="button" class="more" id="more">Show more (${list.length - state.shown} remaining)</button>`;
    $('list').innerHTML = html;
  }

  function render() {
    renderTabs(); renderThemes(); renderRange(); renderList(); writeHash();
  }

  // ---------- Events ----------
  function toggleTheme(id) {
    state.themes.has(id) ? state.themes.delete(id) : state.themes.add(id);
    state.shown = PAGE; render();
  }
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    state.section = b.dataset.section; state.shown = PAGE; render();
  });
  $('themes').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) toggleTheme(b.dataset.theme); });
  $('list').addEventListener('click', e => {
    const t = e.target.closest('.tag'); if (t) { toggleTheme(t.dataset.theme); return; }
    if (e.target.id === 'more') { state.shown += PAGE; renderList(); }
  });
  $('clear-themes').addEventListener('click', () => { state.themes.clear(); render(); });
  $('range').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.range = Number(b.dataset.range); state.shown = PAGE; render(); } });
  let qTimer;
  $('search').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; render(); }, 150); });
  $('reset').addEventListener('click', () => { resetState(); $('search').value = ''; render(); });
  $('filter-toggle').addEventListener('click', () => {
    const open = $('filters').classList.toggle('open');
    $('filter-toggle').setAttribute('aria-expanded', open);
  });
  window.addEventListener('hashchange', () => {
    if (!items.length) return;
    resetState(); readHash(); $('search').value = state.q; render();
  });

  // ---------- Load ----------
  const bust = '?v=' + Math.floor(Date.now() / 600000);
  Promise.all([
    fetch('data/items.json' + bust).then(r => r.ok ? r.json() : []),
    fetch('data/meta.json' + bust).then(r => r.ok ? r.json() : null).catch(() => null)
  ]).then(([data, meta]) => {
    items = Array.isArray(data) ? data : [];
    if (meta && meta.lastUpdated) {
      $('updated').textContent = 'Last updated ' + new Date(meta.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' IST';
    } else { $('updated').textContent = ''; }
    readHash();
    $('search').value = state.q;
    render();
  }).catch(() => {
    $('updated').textContent = '';
    $('list').innerHTML = '<div class="empty">The bulletin data could not be loaded. Please refresh in a moment.</div>';
  });
})();
