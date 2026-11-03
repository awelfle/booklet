// Bulk-add books to a shelf (Are.na channel). books.json is { "added": "YYYY-MM-DD", "books": [ … ] },
// where each book is a POST /v3/blocks body (value, title, description, metadata, …) — the same shape
// the app builds in js/app.js addBook().
//
//   read -s ARENA_TOKEN && export ARENA_TOKEN
//   node scripts/import-books.mjs <channel slug or are.na URL> books.json
//
// The token needs write scope (are.na/settings/personal-access-tokens). Safe to re-run: books whose
// title is already on the shelf are skipped.

import fs from 'node:fs';
import { norm } from '../js/util.js';

const API = 'https://api.are.na/v3';
const [target, file] = process.argv.slice(2);
const token = process.env.ARENA_TOKEN;
if (!target || !file || !token) {
  console.error('Usage: ARENA_TOKEN=… node scripts/import-books.mjs <channel slug or URL> <data.json>');
  process.exit(1);
}
const slug = target.trim().replace(/\/+$/, '').split('/').pop();
const { books, added } = JSON.parse(fs.readFileSync(file, 'utf8'));

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.details?.message || json?.error || `Are.na ${res.status}`);
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const channel = await api(`/channels/${encodeURIComponent(slug)}`);
console.log(`Shelf: ${channel.title} (${channel.visibility})`);

const existing = new Set();
for (let page = 1; page <= 20; page++) {
  const res = await api(`/channels/${encodeURIComponent(slug)}/contents?per=100&page=${page}`);
  res.data.forEach((item) => existing.add(norm(item.title)));
  if (!res.meta?.has_more_pages) break;
}

// Are.na shows the newest addition first, so add in reverse to keep the file's order on the shelf.
let made = 0, skipped = 0, failed = 0;
for (const book of [...books].reverse()) {
  if (existing.has(norm(book.title))) {
    console.log(`  skip  ${book.title} (already on the shelf)`);
    skipped++;
    continue;
  }
  try {
    // silent: don't post 19 "connected" updates to followers' feeds.
    await api('/blocks', {
      method: 'POST',
      body: { ...book, silent: true, channels: [{ id: slug, metadata: { added } }] },
    });
    console.log(`  added ${book.title}`);
    made++;
  } catch (e) {
    console.log(`  FAIL  ${book.title}: ${e.message}`);
    failed++;
  }
  await sleep(2500); // free tier allows 30 writes/minute
}
console.log(`\nDone: ${made} added, ${skipped} skipped, ${failed} failed.`);
