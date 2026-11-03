// Are.na API client and shelf operations. A shelf is a channel; a book on a shelf is a block
// connected to it, and the shelf-specific dates and rating live in that connection's metadata.
import { DEFAULT_CHANNELS } from './config.js';
import { today } from './util.js';

const API = 'https://api.are.na/v3';
// In reading order; tabs, Settings and new-shelf creation follow it.
export const SHELVES = { toread: 'To Read', reading: 'Reading', read: 'Read' };

// ---------- settings ----------
export function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export const cfg = load('shelf.cfg', { token: '', channels: {} });
for (const s of Object.keys(DEFAULT_CHANNELS)) cfg.channels[s] ||= DEFAULT_CHANNELS[s];

// ---------- requests ----------
// Set when Are.na rejects the saved token; reads then fall back to anonymous (the shelves are public).
export let tokenRejected = false;

export async function api(path, { method = 'GET', body, token = cfg.token } = {}) {
  const send = auth => fetch(API + path, {
    method,
    headers: {
      ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await send(token);
  if (r.status === 401 && token && method === 'GET') {
    tokenRejected = true;
    r = await send(null);
  }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) tokenRejected = true;
    throw new Error(j?.details?.message || j?.error || `Are.na error ${r.status}`);
  }
  return j;
}

export async function fetchShelf(shelf) {
  const slug = cfg.channels[shelf];
  if (!slug) return [];
  const items = [];
  for (let page = 1; ; page++) {
    const j = await api(`/channels/${encodeURIComponent(slug)}/contents?per=100&page=${page}`);
    items.push(...j.data.filter(d => d.base_type === 'Block'));
    if (!j.meta?.has_more_pages) return items;
  }
}

// ---------- shelf rules ----------
// The dates a book gets when it arrives on a shelf. Every add and move goes through this.
export function shelfArrival(shelf) {
  const d = today();
  if (shelf === 'reading') return { started: d, finished: null, rating: null };
  if (shelf === 'read') return { finished: d };
  return {};
}

const withoutNulls = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

// Moving = connect to the new shelf, then remove from the old one. If the removal fails, undo the
// new connection so the book never ends up on two shelves.
export async function moveBook(item, to, extra = {}) {
  const metadata = withoutNulls({ ...(item.connection?.metadata || {}), ...shelfArrival(to), ...extra });
  const res = await api('/connections', {
    method: 'POST',
    body: { connectable_id: item.id, connectable_type: 'Block', channels: [{ id: cfg.channels[to], metadata }] },
  });
  try {
    await api(`/connections/${item.connection.id}`, { method: 'DELETE' });
  } catch (err) {
    const created = res?.data?.[0]?.id;
    const undone = created && await api(`/connections/${created}`, { method: 'DELETE' }).then(() => true, () => false);
    throw new Error(undone ? `Couldn't move it: ${err.message}` : `Moved, but it's also still on the old shelf: ${err.message}`);
  }
}

export const updateShelfData = (item, metadata) =>
  api(`/connections/${item.connection.id}`, { method: 'PUT', body: { metadata } });

export const removeFromShelf = item =>
  api(`/connections/${item.connection.id}`, { method: 'DELETE' });

export async function addBlock(block, shelf) {
  await api('/blocks', {
    method: 'POST',
    body: { ...block, channels: [{ id: cfg.channels[shelf], metadata: withoutNulls({ added: today(), ...shelfArrival(shelf) }) }] },
  });
}

// Creates a fresh set of shelves with the given token (not yet saved). Reports partial progress on failure.
export async function createShelves(token) {
  const made = {};
  for (const [shelf, name] of Object.entries(SHELVES)) {
    try {
      const ch = await api('/channels', {
        method: 'POST', token,
        body: { title: `Books: ${name}`, visibility: 'closed', metadata: { shelf } },
      });
      made[shelf] = ch.slug;
    } catch (err) {
      const done = Object.keys(made).map(s => SHELVES[s]).join(', ');
      throw Object.assign(new Error(`Stopped at ${name}: ${err.message}${done ? ` (created: ${done})` : ''}`), { made });
    }
  }
  return made;
}
