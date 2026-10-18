(function () {
  'use strict';

  const SECTIONS = [
    { id: 'all', label: 'All updates' },
    { id: 'govt', label: 'Central Government' },
    { id: 'news', label: 'News & Opinion' },
    { id: 'research', label: 'Research & Reports' },
    { id: 'global', label: 'Global' },
    { id: 'saved', label: 'Saved' }
  ];
  const SECTION_BADGE = { govt: 'Central Government', news: 'News & Opinion', research: 'Research', global: 'Global' };
  const THEMES = [
    { id: 'ece', label: 'Early Childhood Education' },
    { id: 'fln', label: 'FLN' },
    { id: 'tech_ai', label: 'Technology & AI' },
    { id: 'secondary', label: 'Secondary Education' },
    { id: 'assessment', label: 'Assessments' },
    { id: 'teachers', label: 'Teachers' },
    { id: 'curriculum', label: 'Curriculum & Languages' },
    { id: 'equity', label: 'Equity & Inclusion' },
    { id: 'infrastructure', label: 'School Infrastructure' },
    { id: 'vocational', label: 'Vocational & Skills' },
    { id: 'budget', label: 'Budgets & Financing' },
    { id: 'governance', label: 'Governance & Policy' }
  ];
  const THEME_LABEL = Object.fromEntries(THEMES.map(t => [t.id, t.label]));
  const PAGE = 40;
  const DEFAULTS = { section: 'all', range: 7, date: '', q: '', shown: PAGE };

  const state = Object.assign({ themes: new Set() }, DEFAULTS);
  let items = [];
  let loaded = false;
  let calMonth = ''; // 'YYYY-MM' shown in the calendar

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- URL hash <-> state, so filtered views can be shared ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has('s')) state.section = p.get('s');
    if (p.has('t')) state.themes = new Set(p.get('t').split(',').filter(Boolean));
    if (p.has('r')) state.range = Number(p.get('r')) || 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p.get('d') || '')) state.date = p.get('d');
    if (p.has('q')) state.q = p.get('q');
  }
  function writeHash() {
    const p = new URLSearchParams();
    if (state.section !== 'all') p.set('s', state.section);
    if (state.themes.size) p.set('t', [...state.themes].join(','));
    if (state.range !== 7) p.set('r', state.range);
    if (state.date) p.set('d', state.date);
    if (state.q) p.set('q', state.q);
    const h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }
  function resetState() {
    Object.assign(state, DEFAULTS); state.themes.clear(); calMonth = '';
  }

  // ---------- Dates ----------
  // Items are grouped by the day they were added to the bulletin, always in Indian time.
  const TZ = 'Asia/Kolkata';
  const addedAt = it => it.added || it.published;
  const istKey = d => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
  const byNewest = (a, b) => istKey(addedAt(b)).localeCompare(istKey(addedAt(a))) || String(b.published).localeCompare(String(a.published));
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
  const keyLabel = (key, opts) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-IN', Object.assign({ timeZone: 'UTC' }, opts));

  // The Saved tab lists the reader's saved copies; every other tab lists the bulletin.
  const pool = () => state.section === 'saved' ? Account.list().sort(byNewest) : items;

  // ---------- Filtering ----------
  // A picked date replaces the Published range. Saved articles ignore the range so older ones stay visible.
  function matches(it, opts) {
    const o = Object.assign({ section: true, themes: true, date: true, range: state.section !== 'saved' }, opts);
    if (o.section && state.section !== 'all' && state.section !== 'saved' && it.section !== state.section) return false;
    if (o.date && state.date) {
      if (istKey(addedAt(it)) !== state.date) return false;
    } else if (o.date && o.range && state.range) {
      const cutoff = Date.now() - state.range * 86400000;
      if (new Date(addedAt(it)).getTime() < cutoff) return false;
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
      const n = s.id === 'saved'
        ? Account.list().filter(it => matches(it, { section: false, range: false })).length
        : items.filter(it => (s.id === 'all' || it.section === s.id) && matches(it, { section: false, range: true })).length;
      return `<button class="tab" role="tab" data-section="${s.id}" aria-selected="${state.section === s.id}">${icon(s.id)}${esc(s.label)}<span class="n">${n}</span></button>`;
    }).join('');
  }

  function renderThemes() {
    $('themes').innerHTML = THEMES.map(t => {
      const n = pool().filter(it => matches(it, { themes: false }) && (it.themes || []).includes(t.id)).length;
      return `<button type="button" class="chip" data-theme="${t.id}" aria-pressed="${state.themes.has(t.id)}">${icon(t.id)}${esc(t.label)}<span class="n">${n}</span></button>`;
    }).join('');
    $('clear-themes').hidden = state.themes.size === 0;
  }

  function renderRange() {
    document.querySelectorAll('#range button').forEach(b => b.setAttribute('aria-pressed', !state.date && Number(b.dataset.range) === state.range));
    $('range-group').hidden = state.section === 'saved';
  }

  // Month calendar: days with updates (for the current tab, themes and search) can be picked.
  function renderCalendar() {
    const todayKey = istKey(Date.now());
    const all = pool();
    const counts = {};
    all.forEach(it => { if (matches(it, { date: false })) { const k = istKey(addedAt(it)); counts[k] = (counts[k] || 0) + 1; } });
    const firstKey = all.reduce((min, it) => { const k = istKey(addedAt(it)); return k < min ? k : min; }, todayKey);
    const minMonth = firstKey.slice(0, 7), maxMonth = todayKey.slice(0, 7);
    if (!calMonth) calMonth = (state.date || todayKey).slice(0, 7);
    if (calMonth < minMonth) calMonth = minMonth;
    if (calMonth > maxMonth) calMonth = maxMonth;

    const [y, m] = calMonth.split('-').map(Number);
    const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // weeks start on Monday
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span class="cal-dow" aria-hidden="true">${d}</span>`).join('');
    cells += '<span></span>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const key = calMonth + '-' + String(d).padStart(2, '0');
      const n = counts[key] || 0;
      const label = keyLabel(key, { day: 'numeric', month: 'long' }) + (n ? ` · ${n} ${n === 1 ? 'update' : 'updates'}` : ' · no updates');
      cells += `<button type="button" class="cal-day${key === todayKey ? ' today' : ''}" data-date="${key}" aria-pressed="${state.date === key}" aria-label="${label}" title="${label}"${n ? '' : ' disabled'}>${d}</button>`;
    }
    $('cal').innerHTML = `<div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Previous month"${calMonth <= minMonth ? ' disabled' : ''}>${icon('prev')}</button>
        <span class="cal-title">${esc(keyLabel(calMonth + '-01', { month: 'long', year: 'numeric' }))}</span>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Next month"${calMonth >= maxMonth ? ' disabled' : ''}>${icon('next')}</button>
      </div><div class="cal-grid">${cells}</div>`;
    $('clear-date').hidden = !state.date;
  }

  function dayLabel(d) {
    const key = istKey(d);
    const full = new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const short = new Date(d).toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'long' });
    if (key === istKey(Date.now())) return 'Today · ' + short;
    if (key === istKey(Date.now() - 86400000)) return 'Yesterday · ' + short;
    return full;
  }

  function card(it) {
    const time = 'Published ' + new Date(it.published).toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' });
    const tags = (it.themes || []).map(t => `<button type="button" class="tag" data-theme="${t}">${icon(t)}${esc(THEME_LABEL[t] || t)}</button>`).join('');
    const isSaved = Account.has(it.id);
    return `<article class="card" data-section="${esc(it.section)}">
      <div class="meta"><span class="badge">${icon(it.section)}${esc(SECTION_BADGE[it.section] || '')}</span>
        <span class="src">${esc(it.source || '')}</span><span>${time}</span></div>
      <h3><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>
      ${it.blurb ? `<p class="blurb">${esc(it.blurb)}</p>` : ''}
      <div class="foot"><div class="tags">${tags}</div>
        <button type="button" class="save" data-save="${esc(it.id)}" aria-pressed="${isSaved}" title="${isSaved ? 'Remove from saved' : 'Save to read later'}">${icon('bookmark')}<span>${isSaved ? 'Saved' : 'Save'}</span></button>
        <a class="read" href="${esc(it.url)}" target="_blank" rel="noopener">Read original ${icon('external')}</a></div>
    </article>`;
  }

  function renderList() {
    const list = pool().filter(it => matches(it));
    const noun = state.section === 'saved' ? (list.length === 1 ? 'saved article' : 'saved articles') : (list.length === 1 ? 'update' : 'updates');
    $('count').textContent = `${list.length} ${noun}`;
    $('date-pill').hidden = !state.date;
    if (state.date) $('date-pill').innerHTML = `${icon('calendar')}${esc(keyLabel(state.date, { day: 'numeric', month: 'short', year: 'numeric' }))}${icon('x')}<span class="sr">Clear date</span>`;
    if (!list.length) {
      let msg = state.date
        ? 'No updates on this date match these filters. Pick another date or clear some themes.'
        : 'No updates match these filters. Try a wider date range or clear some themes.';
      if (state.section === 'saved' && !Account.list().length) {
        msg = 'You have not saved any articles yet. Tap <strong>Save</strong> on any card to keep it here.';
      }
      $('list').innerHTML = `<div class="empty">${msg}</div>`;
      return;
    }
    let html = '';
    if (state.section === 'saved' && Account.enabled && !Account.signedIn()) {
      html += '<p class="note">These are saved in this browser only. Sign in to keep them in your account and see them on any device.</p>';
    }
    let lastDay = '';
    list.slice(0, state.shown).forEach(it => {
      const d = dayLabel(addedAt(it));
      if (d !== lastDay) { html += `<h2 class="day">${icon('calendar')}${esc(d)}</h2>`; lastDay = d; }
      html += card(it);
    });
    if (list.length > state.shown) html += `<button type="button" class="more" id="more">Show more (${list.length - state.shown} remaining)</button>`;
    $('list').innerHTML = html;
  }

  function render() {
    renderTabs(); renderThemes(); renderRange(); renderCalendar(); renderList(); writeHash();
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
    const sv = e.target.closest('.save');
    if (sv) { Account.toggle(items.find(it => it.id === sv.dataset.save) || Account.get(sv.dataset.save)); return; }
    if (e.target.id === 'more') { state.shown += PAGE; renderList(); }
  });
  $('clear-themes').addEventListener('click', () => { state.themes.clear(); render(); });
  $('range').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.range = Number(b.dataset.range); state.date = ''; state.shown = PAGE; render(); } });
  $('cal').addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { calMonth = shiftMonth(calMonth, Number(nav.dataset.nav)); renderCalendar(); return; }
    const day = e.target.closest('[data-date]');
    if (!day || day.disabled) return;
    state.date = state.date === day.dataset.date ? '' : day.dataset.date;
    state.shown = PAGE; render();
    // On phones, close the filter panel so the picked day's updates are in view.
    if (state.date && $('filters').classList.contains('open')) {
      $('filters').classList.remove('open'); $('filter-toggle').setAttribute('aria-expanded', false);
    }
  });
  const clearDate = () => { state.date = ''; state.shown = PAGE; render(); };
  $('clear-date').addEventListener('click', clearDate);
  $('date-pill').addEventListener('click', clearDate);
  Account.onChange(() => { if (loaded) render(); });
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
    // Only show items with a working direct link; unresolved Google News links are retried daily.
    items = (Array.isArray(data) ? data : []).filter(it => /^https?:\/\//.test(it.url || '') && !it.url.includes('news.google.com'));
    // Newest additions first; within the same day, newest publications first.
    items.sort(byNewest);
    const todayKey = istKey(Date.now());
    $('stat-today').textContent = items.filter(it => istKey(addedAt(it)) === todayKey).length;
    $('stat-week').textContent = items.filter(it => Date.now() - new Date(addedAt(it)).getTime() < 7 * 86400000).length;
    if (meta && meta.lastUpdated) {
      $('updated').textContent = 'Last updated ' + new Date(meta.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' IST';
    } else { $('updated').textContent = ''; }
    readHash();
    $('search').value = state.q;
    loaded = true;
    render();
  }).catch(() => {
    $('updated').textContent = '';
    $('list').innerHTML = '<div class="empty">The bulletin data could not be loaded. Please refresh in a moment.</div>';
  });
})();
