// Book search: Google Books and Open Library in parallel, merged into one row per book.
// Google is better at finding books (new releases, typos); Open Library is better at picking the
// U.S. edition (see editions.js). Background in DEVLOG "Open Library vs Google Books".
import { GOOGLE_BOOKS_KEY } from './config.js';
import { norm, stripArticle, isbn10to13 } from './util.js';

export const olCover = (doc, size = 'L') => doc?.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-${size}.jpg` : null;

// "qntm (Author of science fiction)" → "qntm"
export const cleanAuthors = names => (names || []).map(n => n.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);

export async function searchOpenLibrary(q, { signal } = {}) {
  const fields = 'key,title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median';
  const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=${fields}`, { signal });
  if (!r.ok) throw new Error(`Open Library ${r.status}`);
  return ((await r.json()).docs || []).map(d => ({ ...d, author_name: cleanAuthors(d.author_name), source: 'ol' }));
}

// Google appends marketing tags to titles, e.g. "James (Pulitzer Prize Winner)".
const MARKETING_TAG = /\s*\((?=[^)]*\b(winner|edition|novel|pick|club|bestseller|series)\b)[^)]*\)\s*$/i;

export function fromGoogleVolume(v) {
  const info = v.volumeInfo || {};
  const ids = Object.fromEntries((info.industryIdentifiers || []).map(i => [i.type, i.identifier]));
  const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  return {
    source: 'gb', gb: v,
    title: (info.title || '').replace(MARKETING_TAG, ''),
    author_name: cleanAuthors(info.authors),
    first_publish_year: +(info.publishedDate || '').slice(0, 4) || undefined,
    isbn13: ids.ISBN_13 || (ids.ISBN_10 && isbn10to13(ids.ISBN_10)),
    // Google serves small thumbnails by default; fife asks for a larger rendition.
    coverUrl: thumb ? thumb.replace(/^http:/, 'https:').replace(/&edge=curl/, '') + '&fife=w800' : null,
  };
}

export async function searchGoogleBooks(q, { signal } = {}) {
  if (!GOOGLE_BOOKS_KEY) return [];
  const isbn = q.replace(/[-\s]/g, '');
  const query = /^(97[89])?\d{9}[\dX]$/i.test(isbn) ? `isbn:${isbn}` : q;
  const params = new URLSearchParams({
    q: query, key: GOOGLE_BOOKS_KEY, country: 'US', langRestrict: 'en', printType: 'books', maxResults: '10',
  });
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, { signal });
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(`Google Books ${r.status}${j?.error?.message ? ': ' + j.error.message : ''}`);
  }
  return ((await r.json()).items || []).map(fromGoogleVolume);
}

// "The Wager" and "Wager" are the same book; so are "Le Guin" and "Ursula K. Le Guin".
export const bookKey = d => `${stripArticle(norm(d.title))} | ${norm(d.author_name?.[0]).split(' ').pop()}`;

// One row per book. Either source may be missing (null = still loading).
export function mergeResults(q, ol, gb) {
  const rows = [];
  const byKey = new Map();
  const add = (key, row) => { byKey.set(key, row); rows.push(row); };

  // Google often lists a no-ISBN record (ebook or preview) ahead of the real edition; prefer the real one.
  [...(gb || [])].sort((a, b) => !!b.isbn13 - !!a.isbn13).forEach((d, i) => {
    const key = bookKey(d);
    if (!byKey.has(key)) add(key, { gb: d, ol: null, order: i });
  });
  (ol || []).forEach((d, i) => {
    const key = bookKey(d);
    const row = byKey.get(key);
    if (row) row.ol ||= d;
    else add(key, { gb: null, ol: d, order: 100 + i });
  });

  const query = norm(q);
  const words = query.split(' ').filter(w => w.length > 1);
  const relevance = row => {
    const d = row.gb || row.ol;
    const title = norm(d.title);
    const hay = ` ${title} ${norm((d.author_name || []).join(' '))} `;
    const hits = words.filter(w => hay.includes(` ${w} `)).length / (words.length || 1);
    return hits + (stripArticle(title) === stripArticle(query) ? 1 : 0);
  };

  // Ties go to Google's order — it ranked the right book first more often in testing.
  return rows
    .map(row => ({ row, r: relevance(row) }))
    .sort((a, b) => b.r - a.r || a.row.order - b.row.order)
    .map(({ row }) => {
      const d = row.gb || row.ol;
      return {
        gb: row.gb, ol: row.ol,
        title: d.title,
        author_name: d.author_name,
        year: row.ol?.first_publish_year || row.gb?.first_publish_year,
        thumb: row.gb?.coverUrl || olCover(row.ol, 'M'),
      };
    });
}
