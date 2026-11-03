// UI: shelves list, add-a-book search, book detail sheet, settings.
import { VERSION, DEFAULT_CHANNELS } from './config.js';
import { esc, safeUrl, today, fmtDate, starStr } from './util.js';
import {
  SHELVES, cfg, load, save, fetchShelf, moveBook, updateShelfData, removeFromShelf, addBlock,
  createShelves, tokenRejected,
} from './arena.js';
import { searchOpenLibrary, searchGoogleBooks, mergeResults } from './search.js';
import { bookRecord } from './editions.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let current = load('shelf.tab', 'reading');
const cache = { toread: null, reading: null, read: null };

// ---------- adding ----------
async function addBook(result, shelf) {
  const { author, metadata, description, cover, sourceUrl, sourceTitle } = await bookRecord(result);
  const blurb = description.length > 3000 ? description.slice(0, 3000).replace(/\s+\S*$/, '') + '…' : description;
  await addBlock({
    // A cover image makes a nice Image block; without one, link to the book's page.
    value: cover || sourceUrl,
    title: result.title,
    description: [author && `by ${author}`, blurb].filter(Boolean).join('\n\n') || undefined,
    original_source_url: sourceUrl,
    original_source_title: sourceTitle,
    alt_text: cover ? `Cover of ${result.title}` : undefined,
    metadata,
  }, shelf);
}

const addManual = (title, shelf) => addBlock({ value: title, title, metadata: { kind: 'book' } }, shelf);

// ---------- rendering ----------
function bookView(item) {
  const m = item.metadata || {};
  return {
    title: item.title || 'Untitled',
    author: m.author || (item.description?.plain?.match(/^by (.+)/)?.[1] ?? ''),
    img: item.image?.small?.src || m.cover,
    m,
    c: item.connection?.metadata || {},
  };
}

function coverHtml(img, title, cls = 'cover') {
  return img
    ? `<img class="${cls}" src="${esc(img)}" alt="" loading="lazy">`
    : `<div class="${cls}">${esc((title || '?')[0])}</div>`;
}

function subline(shelf, c) {
  if (shelf === 'reading' && c.started) return `Started ${esc(fmtDate(c.started))}`;
  if (shelf === 'read') {
    const parts = [];
    if (c.rating) parts.push(`<span class="stars">${starStr(c.rating)}</span>`);
    if (c.finished) parts.push(`Finished ${esc(fmtDate(c.finished))}`);
    return parts.join(' · ');
  }
  if (shelf === 'toread' && c.added) return `Added ${esc(fmtDate(c.added))}`;
  return '';
}

function renderTabs() {
  $$('nav.tabs button').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.shelf === current);
    $('.count', b).textContent = cache[b.dataset.shelf]?.length || '';
  });
}

function renderList() {
  renderTabs();
  const list = $('#list');
  if (!hasShelves()) {
    list.innerHTML = `<div class="empty">Welcome to Booklet.<small>Your books live on Are.na. Add a token and Booklet will make three shelves for you.</small>
      <button class="btn primary welcome-btn" id="setupBtn">Set up Booklet</button></div>`;
    $('#setupBtn').onclick = openSettings;
    return;
  }
  const items = cache[current];
  if (!items) { list.innerHTML = `<div class="empty"><span class="spin"></span></div>`; return; }
  if (!items.length) {
    const msg = { reading: 'Nothing on the nightstand.', toread: 'The pile is empty.', read: 'Nothing finished yet.' }[current];
    list.innerHTML = `<div class="empty">${msg}<small>Tap + to add a book.</small></div>`;
    return;
  }
  list.innerHTML = items.map((it, i) => {
    const v = bookView(it);
    return `<button class="book" data-i="${i}">
      ${coverHtml(v.img, v.title)}
      <div class="meta">
        <div class="title">${esc(v.title)}</div>
        ${v.author ? `<div class="author">${esc(v.author)}</div>` : ''}
        <div class="sub">${subline(current, v.c)}</div>
      </div>
    </button>`;
  }).join('');
}

// Each shelf keeps a request counter so a slow, older response can't overwrite a newer one.
const refreshSeq = { toread: 0, reading: 0, read: 0 };
let warnedToken = false;
async function refresh(shelf = current) {
  const seq = ++refreshSeq[shelf];
  try {
    const items = await fetchShelf(shelf);
    if (seq !== refreshSeq[shelf]) return;
    cache[shelf] = items;
  } catch (e) {
    if (seq !== refreshSeq[shelf]) return;
    cache[shelf] ||= [];
    toast(e.message);
  }
  if (tokenRejected && !warnedToken) {
    warnedToken = true;
    toast('Are.na rejected your token. Shelves still load; add a new token in Settings to make changes.');
  }
  if (shelf === current) renderList(); else renderTabs();
}
const refreshAll = () => Promise.all(Object.keys(SHELVES).map(s => refresh(s)));

// ---------- sheets & toasts ----------
let openSheetEl = null;
function openSheet(el) {
  closeSheet();
  openSheetEl = el;
  el.classList.add('open');
  $('#scrim').classList.add('open');
}
function closeSheet() {
  openSheetEl?.classList.remove('open');
  openSheetEl = null;
  $('#scrim').classList.remove('open');
}
$('#scrim').onclick = closeSheet;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), msg.length > 60 ? 4500 : 2600);
}

const hasShelves = () => Object.keys(SHELVES).every(s => cfg.channels[s]);

function requireToken() {
  if (cfg.token && hasShelves()) return true;
  toast(cfg.token ? 'Set up your shelves first' : 'Add your Are.na token first');
  openSettings();
  return false;
}

// Runs an action with the button showing a spinner and the sheet's buttons disabled;
// closes the sheet and refreshes the touched shelves after.
async function busy(btn, fn, shelves) {
  const sheet = btn.closest('.sheet');
  const label = btn.innerHTML;
  $$('button', sheet).forEach(b => b.disabled = true);
  btn.innerHTML = '<span class="spin"></span>';
  try {
    await fn();
    closeSheet();
    await Promise.all(shelves.map(s => refresh(s)));
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  } finally {
    btn.innerHTML = label;
    $$('button', sheet).forEach(b => b.disabled = false);
  }
}

// ---------- tabs & list ----------
$$('nav.tabs button').forEach(b => b.onclick = () => {
  current = b.dataset.shelf;
  save('shelf.tab', current);
  renderList();
  if (!cache[current]) refresh();
});

$('#list').onclick = e => {
  const b = e.target.closest('.book');
  if (b) openDetail(cache[current][+b.dataset.i], current);
};

// ---------- add ----------
let addShelf = 'toread';
function syncAddShelf() {
  $$('#addShelf button').forEach(b => b.setAttribute('aria-pressed', b.dataset.shelf === addShelf));
}
$('#addBtn').onclick = () => {
  if (!requireToken()) return;
  addShelf = current;
  syncAddShelf();
  $('#q').value = '';
  $('#results').innerHTML = '';
  openSheet($('#addSheet'));
  setTimeout(() => $('#q').focus(), 250);
};
// While results scroll under the pinned search field: show a divider, and on touch-scroll put the
// keyboard away so more results fit (the field stays visible, so tapping it brings it back).
const addSheet = $('#addSheet');
addSheet.addEventListener('scroll', () => $('.sheet-head', addSheet).classList.toggle('scrolled', addSheet.scrollTop > 0), { passive: true });
addSheet.addEventListener('touchmove', e => {
  if (document.activeElement === $('#q') && !e.target.closest('.sheet-head')) $('#q').blur();
}, { passive: true });

$('#addShelf').onclick = e => {
  const b = e.target.closest('button');
  if (b) { addShelf = b.dataset.shelf; syncAddShelf(); }
};

let searchTimer, searchCtl, results = [];
let adding = false; // results can re-render while an add is running; keep them inert until it's done

// Renders whatever has arrived so far; null means that source is still loading.
function renderResults(q, ol, gb, problems) {
  results = mergeResults(q, ol, gb);
  const waiting = ol === null || gb === null;
  const off = adding ? ' disabled' : '';
  $('#results').innerHTML = results.map((d, i) => `
    <button class="book" data-i="${i}"${off}>
      ${coverHtml(d.thumb, d.title)}
      <div class="meta">
        <div class="title">${esc(d.title)}</div>
        <div class="author">${esc((d.author_name || []).slice(0, 2).join(', '))}${d.year ? ' · ' + d.year : ''}</div>
      </div>
    </button>`).join('') +
    (waiting
      ? `<div class="empty results-status"><span class="spin"></span></div>`
      : `<button class="btn quiet" id="manualAdd"${off}>Add “${esc(q)}” without details</button>`) +
    problems.map(p => `<div class="hint problem">${esc(p)}</div>`).join('');
}

$('#q').oninput = () => {
  clearTimeout(searchTimer);
  searchCtl?.abort();
  const q = $('#q').value.trim();
  if (q.length < 2) { $('#results').innerHTML = ''; return; }
  searchTimer = setTimeout(() => {
    const ctl = searchCtl = new AbortController();
    let ol = null, gb = null;
    const problems = [];
    renderResults(q, ol, gb, problems);
    const settle = (promise, set) => promise
      .then(set, e => { if (e.name !== 'AbortError') problems.push(e.message); set([]); })
      .then(() => { if (!ctl.signal.aborted) renderResults(q, ol, gb, problems); });
    settle(searchGoogleBooks(q, ctl), v => { gb = v; });
    settle(searchOpenLibrary(q, ctl), v => { ol = v; });
  }, 350);
};

$('#results').onclick = async e => {
  if (adding) return;
  const target = e.target.closest('#manualAdd, .book');
  if (!target) return;
  const shelf = addShelf;
  const doc = target.id === 'manualAdd' ? null : results[+target.dataset.i];
  const q = $('#q').value.trim();
  adding = true;
  $$('#results button').forEach(b => b.disabled = true);
  const ok = await busy(target, () => (doc ? addBook(doc, shelf) : addManual(q, shelf)), [shelf]).finally(() => { adding = false; });
  if (!ok) return;
  toast(`Added to ${SHELVES[shelf]}`);
  if (current !== shelf) { current = shelf; save('shelf.tab', current); renderList(); }
};

// ---------- detail ----------
const DATE_FIELDS = { reading: [['Started', 'started']], read: [['Started', 'started'], ['Finished', 'finished']] };

function openDetail(item, shelf) {
  const v = bookView(item);
  const sheet = $('#detailSheet');
  const facts = [v.m.format, v.m.publisher, v.m.year, v.m.pages && `${v.m.pages} pages`].filter(Boolean).join(' · ');
  const blurb = (item.description?.plain || '').replace(/^by .*(\n+|$)/, '').trim();
  const links = [['Open Library', v.m.openlibrary_url], ['Google Books', v.m.google_books_url], ['Bookshop', v.m.bookshop_url], ['Amazon', v.m.amazon_url]]
    .map(([label, url]) => [label, safeUrl(url)])
    .filter(([, url]) => url)
    .map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`).join('');
  // Dates live on the shelf connection; the app sets them when a book arrives, and these override them.
  const dates = (DATE_FIELDS[shelf] || []).map(([label, key]) => `
    <label class="date-field">
      <span class="date-label">${label}</span>
      <span class="date-value${v.c[key] ? '' : ' is-empty'}">
        <span class="date-empty">Add date</span>
        <input type="date" data-date="${key}" value="${esc(v.c[key] || '')}" max="${today()}" aria-label="${label} date">
      </span>
    </label>`).join('');
  const btns = {
    toread: [`<button class="btn primary" data-act="start">Start reading</button>`],
    reading: [`<button class="btn primary" data-act="finish">Finished it</button>`, `<button class="btn" data-act="shelve">Back to To Read</button>`],
    read: [`<button class="btn" data-act="rate">Change rating</button>`, `<button class="btn" data-act="reread">Reading it again</button>`],
  }[shelf].concat(
    `<a class="btn quiet" href="https://www.are.na/block/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">Open in Are.na</a>`,
    `<button class="btn quiet danger" data-act="remove">Remove from ${SHELVES[shelf]}</button>`,
  );

  sheet.innerHTML = `
    <div class="grabber"></div>
    <div class="detail-head">
      ${coverHtml(v.img, v.title)}
      <div class="meta">
        <h2>${esc(v.title)}</h2>
        ${v.author ? `<div class="author">${esc(v.author)}</div>` : ''}
        ${facts ? `<div class="sub">${esc(facts)}</div>` : ''}
        <div class="sub" data-subline>${subline(shelf, v.c)}</div>
      </div>
    </div>
    ${dates ? `<div class="dates">${dates}</div>` : ''}
    ${links ? `<div class="links">${links}</div>` : ''}
    ${blurb ? `<p class="blurb" data-more>${esc(blurb)}</p>` : ''}
    <div class="actions">${btns.join('')}</div>`;

  const actions = {
    start: b => busy(b, () => moveBook(item, 'reading'), ['toread', 'reading']),
    shelve: b => busy(b, () => moveBook(item, 'toread'), ['reading', 'toread']),
    reread: b => busy(b, () => moveBook(item, 'reading'), ['read', 'reading']),
    finish: () => showRating(v, rating => moveBook(item, 'read', rating ? { rating } : {}), ['reading', 'read']),
    rate: () => showRating(v, rating => updateShelfData(item, { rating: rating || null }), ['read']),
    remove: b => {
      if (confirm(`Remove “${v.title}” from ${SHELVES[shelf]}? The block stays in your Are.na account.`))
        busy(b, () => removeFromShelf(item), [shelf]);
    },
  };
  sheet.onclick = e => {
    const more = e.target.closest('[data-more]');
    if (more) { more.classList.toggle('open'); return; }
    const b = e.target.closest('[data-act]');
    if (b && requireToken()) actions[b.dataset.act](b);
  };

  sheet.onchange = async e => {
    const input = e.target.closest('[data-date]');
    if (!input) return;
    const key = input.dataset.date;
    const before = v.c[key] || '';
    const showEmpty = () => input.parentElement.classList.toggle('is-empty', !input.value);
    const revert = msg => { input.value = before; showEmpty(); toast(msg); };
    showEmpty();
    if (!cfg.token) return revert('Add your token in Settings first');
    const value = input.value || null; // clearing the field removes the date
    input.disabled = true;
    try {
      await updateShelfData(item, { [key]: value });
      const meta = { ...item.connection.metadata, [key]: value };
      if (!value) delete meta[key];
      item.connection.metadata = v.c = meta;
      $('[data-subline]', sheet).innerHTML = subline(shelf, meta);
      toast(meta.started && meta.finished && meta.finished < meta.started ? 'Saved — note: finished is before started' : 'Date saved');
      renderList();
    } catch (err) {
      revert(err.message);
    } finally {
      input.disabled = false;
    }
  };
  openSheet(sheet);
}

function showRating(v, commit, shelves) {
  const sheet = $('#detailSheet');
  let rating = Math.max(0, Math.min(5, +v.c.rating || 0));
  sheet.innerHTML = `
    <div class="grabber"></div>
    <h2 class="centered">${esc(v.title)}</h2>
    <p class="lede centered">How was it?</p>
    <div class="rate">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" aria-label="${n} stars">★</button>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-save>Save</button>
      <button class="btn quiet" data-skip>Skip rating</button>
    </div>`;
  const paint = () => $$('.rate button', sheet).forEach(b => b.classList.toggle('on', +b.dataset.n <= rating));
  paint();
  sheet.onchange = null;
  sheet.onclick = e => {
    const star = e.target.closest('[data-n]');
    if (star) { rating = +star.dataset.n === rating ? 0 : +star.dataset.n; paint(); return; }
    const save = e.target.closest('[data-save]'), skip = e.target.closest('[data-skip]');
    if (save || skip) busy(save || skip, () => commit(save ? rating : 0), shelves);
  };
}

// ---------- settings ----------
function openSettings() {
  $('#token').value = cfg.token;
  for (const s of Object.keys(SHELVES)) $('#ch-' + s).value = cfg.channels[s] || '';
  const firstRun = !hasShelves();
  $('#createShelvesFirst').hidden = !firstRun;
  $('#startOver').hidden = firstRun;
  $('#shelvesHint').textContent = firstRun
    ? 'No shelves yet. Create them, or paste the links of channels you already use.'
    : 'Paste a channel link or slug to use a different shelf.';
  openSheet($('#settingsSheet'));
}
$('#settingsBtn').onclick = openSettings;

// Accepts a slug or a full are.na channel URL.
const toSlug = v => v.trim().replace(/\/+$/, '').split('/').pop();

$('#saveSettings').onclick = () => {
  cfg.token = $('#token').value.trim();
  // A cleared field means "use the default shelf".
  for (const s of Object.keys(SHELVES)) cfg.channels[s] = toSlug($('#ch-' + s).value) || DEFAULT_CHANNELS[s] || '';
  save('shelf.cfg', cfg);
  warnedToken = false;
  closeSheet();
  Object.keys(cache).forEach(k => { cache[k] = null; });
  renderList();
  refreshAll();
};

async function onCreateShelves(e, { firstRun }) {
  e.preventDefault();
  const control = e.currentTarget;
  if (control.dataset.busy) return;
  const token = $('#token').value.trim();
  if (!token) { toast('Paste your token first'); return; }
  if (!firstRun && !confirm('Create three new, empty shelves on Are.na?\n\nYour current shelves and books won’t be touched. The app switches to the new shelves only after you tap Save.')) return;
  control.dataset.busy = '1';
  const label = control.textContent;
  control.textContent = 'Creating shelves…';
  const fill = made => Object.entries(made).forEach(([s, slug]) => { $('#ch-' + s).value = slug; });
  try {
    fill(await createShelves(token));
    if (firstRun) {
      $('#saveSettings').click();
      toast('Your shelves are ready. Tap + to add a book.');
    } else {
      toast('New shelves created. Tap Save to switch to them.');
    }
  } catch (err) {
    fill(err.made || {});
    toast(err.message);
  } finally {
    delete control.dataset.busy;
    control.textContent = label;
  }
}
$('#createShelves').onclick = e => onCreateShelves(e, { firstRun: false });
$('#createShelvesFirst').onclick = e => onCreateShelves(e, { firstRun: true });

// ---------- boot ----------
$('#version').textContent = `Version ${VERSION}.`;
renderList();
refreshAll();
