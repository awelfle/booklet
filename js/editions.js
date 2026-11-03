// Picking the edition to save: the U.S. English print edition, hardcover first.
// Open Library lumps every edition of a work together and rarely records a country, so we score on
// clues; Google lists one edition per result but often not the U.S. one.
import { norm, isbn10to13, isbn13to10, htmlToText } from './util.js';
import { searchGoogleBooks, searchOpenLibrary, bookKey, olCover } from './search.js';

// ISBN publisher prefixes, for editions with no other country clues.
// Checked against real mix-ups: Knopf U.S. (978-0-593) vs Knopf Canada (978-0-7352),
// New Directions (978-0-8112) vs the U.K. edition of the same translation.
const US_ISBN_PREFIXES = [
  '9780593', '9780525', '9780399', '9780385', '9780307', '9780375', '9780679', '97808129', '9780345', // Penguin Random House U.S. (978-0-8129 = Random House trade; 978-0-8124 is Perfection Learning)
  '9780553', '9780441', '9780756',                                                              // Bantam, Ace, DAW
  '9780374', '9781250', '9780312', '9780765', '9780805',                                         // Macmillan U.S. (FSG, St. Martin's, Tor, Holt)
  '9780062', '9780063', '9780060', '9780061',                                                   // HarperCollins U.S.
  '9781982', '9781501', '9781476', '9780743', '9781451', '9781439', '9781668',                   // Simon & Schuster U.S.
  '9780395', '9780544', '9780547', '9780358',                                                   // Houghton Mifflin (Harcourt)
  '9780316', '9781538', '9780446',                                                              // Hachette U.S. (Little, Brown; Grand Central)
  '9780393', '9781324', '9780811', '9781644', '9781555', '9781571', '9781566', '9781612', '9781635', // Norton, New Directions, Graywolf, Milkweed, Coffee House, Melville House, Bloomsbury USA
];
const NON_US_ISBN_PREFIXES = [
  '97807352', '978038568', '978038569', '9781443', '9780771',      // Canada (PRH Canada, Doubleday Canada, HarperCollins Canada, McClelland & Stewart)
  '9781529', '9781784', '9781473', '9780571', '9781526', '9780008', '9780007', '9781399', '9780241', // U.K.
];
const ENGLISH_ISBN = /^97(8[01]|98)/; // 978-0, 978-1 and 979-8 (979-8 is U.S.-only)

// 'us' / 'non-us' / 'unknown' from the ISBN alone.
export function isbnRegion(isbn13) {
  if (!isbn13) return 'unknown';
  if (isbn13.startsWith('9798') || US_ISBN_PREFIXES.some(p => isbn13.startsWith(p))) return 'us';
  if (!ENGLISH_ISBN.test(isbn13) || NON_US_ISBN_PREFIXES.some(p => isbn13.startsWith(p))) return 'non-us';
  return 'unknown';
}
export const REGION_RANK = { us: 2, unknown: 1, 'non-us': 0 };

// Not a regular print edition. Word-bounded so e.g. "cd" doesn't match "McDonald".
const NOT_PRINT_FORMAT = /\b(e-?book|electronic|audio\w*|kindle|large print|library binding|prebound|gift|signed|limited|slipcase|deluxe|collector'?s?|box(ed)? set|special edition|cd|mp3)\b/;
const NOT_PRINT_PUBLISHER = /\b(thorndike|large print|prebound|signed|limited (issue|edition))\b/;
const US_TEXT = /\b(USA|U\.S\.A?\.?|United States|New York|NY|Boston|Chicago|San Francisco|Berryville)\b/;
const NON_US_TEXT = /\b(UK|U\.K\.|London|PLC|Ltd|Limited|Canada|Toronto)\b/;

const earliest = e => Date.parse(e.publish_date) || Date.parse(String(e.publish_date || '').match(/\d{4}/)?.[0]) || Infinity;

export function pickEdition(entries) {
  const eds = entries.map(e => {
    const isbn13 = e.isbn_13?.[0] || (e.isbn_10?.[0] && isbn10to13(e.isbn_10[0]));
    const langs = (e.languages || []).map(l => l.key.split('/').pop());
    const text = [...(e.publishers || []), ...(e.publish_places || [])].join(' ');
    return { e, isbn13, fmt: (e.physical_format || '').toLowerCase(), langs, text };
  }).filter(x =>
    x.isbn13 && ENGLISH_ISBN.test(x.isbn13) &&
    (!x.langs.length || x.langs.includes('eng')) &&
    !NOT_PRINT_FORMAT.test(x.fmt) && !NOT_PRINT_PUBLISHER.test(x.text.toLowerCase())
  );
  if (!eds.length) return null;

  for (const x of eds) {
    const region = isbnRegion(x.isbn13);
    x.us = region === 'us' || !!x.e.lccn?.length || /u$/.test(x.e.publish_country || '') || US_TEXT.test(x.text);
    x.nonUs = region === 'non-us' || NON_US_TEXT.test(x.text) || /(k|c)$/.test(x.e.publish_country || '');
  }
  // Editions sharing an ISBN publisher prefix with a U.S. edition are almost always from the same U.S. imprint.
  const usPrefixes = new Set(eds.filter(x => x.us).map(x => x.isbn13.slice(0, 9)));
  for (const x of eds) {
    x.us ||= usPrefixes.has(x.isbn13.slice(0, 9));
    x.region = x.us ? 'us' : x.nonUs ? 'non-us' : 'unknown';
    x.score = (x.us ? 10 : 0) - (x.nonUs ? 10 : 0)
      + (/hardcover|hardback/.test(x.fmt) ? 4 : x.fmt.includes('paperback') ? 2 : 0)
      + (x.e.covers?.length ? 1 : 0);
    x.time = earliest(x.e);
  }
  return eds.sort((a, b) => b.score - a.score || a.time - b.time)[0];
}

async function olJson(path) {
  const r = await fetch('https://openlibrary.org' + path);
  if (!r.ok) throw new Error('Open Library ' + r.status);
  return r.json();
}

// The work's description and best edition. All editions are needed: stopping at the first U.S. one
// picks worse editions (e.g. a library prebound over the Houghton Mifflin hardcover of The Hobbit).
// Failures here shouldn't block adding the book.
async function workDetails(workKey) {
  const [work, editions] = await Promise.all([
    olJson(workKey + '.json').catch(() => ({})),
    olJson(workKey + '/editions.json?limit=500').catch(() => ({ entries: [] })),
  ]);
  const desc = typeof work.description === 'string' ? work.description : work.description?.value || '';
  return { description: desc.trim(), edition: pickEdition(editions.entries || []) };
}

// For a book found only on Google: find the same work in Open Library, by ISBN, then by title + author.
async function findWorkKey(gb) {
  if (gb.isbn13) {
    const ed = await olJson(`/isbn/${gb.isbn13}.json`).catch(() => null);
    if (ed?.works?.[0]?.key) return ed.works[0].key;
  }
  const hits = await searchOpenLibrary(`${gb.title} ${gb.author_name?.[0] || ''}`).catch(() => []);
  return hits.find(d => bookKey(d) === bookKey(gb))?.key || null;
}

// Google's best edition of this book: the one we already have if it's clearly U.S., otherwise one more
// targeted search for a U.S. listing. Google ignores country=US for which edition it lists first.
async function googleEdition(result) {
  const current = result.gb?.isbn13 ? result.gb : null;
  if (current && isbnRegion(current.isbn13) === 'us') return current;
  const surname = norm(result.author_name?.[0]).split(' ').pop();
  const found = await searchGoogleBooks(`intitle:"${result.title.replace(/"/g, '')}" inauthor:${surname}`).catch(() => []);
  const rank = d => REGION_RANK[isbnRegion(d.isbn13)];
  return [current, ...found.filter(d => d.isbn13 && bookKey(d) === bookKey(result))]
    .filter(Boolean)
    .sort((a, b) => rank(b) - rank(a))[0] || null;
}

export function referenceLinks(isbn13, title, author) {
  const isbn10 = isbn13 && isbn13to10(isbn13);
  const q = encodeURIComponent(isbn13 || `${title} ${author}`);
  return {
    bookshop_url: `https://bookshop.org/search?keywords=${q}`,
    amazon_url: isbn10 ? `https://www.amazon.com/dp/${isbn10}` : `https://www.amazon.com/s?k=${q}&i=stripbooks`,
  };
}

// Everything to store for a search result. Edition, ISBN and links come from whichever source has the
// more clearly U.S. edition (Open Library on ties: it knows hardcover vs paperback); anything missing
// (the whole book, a description, a cover) is filled from Google.
export async function bookRecord(result) {
  const { gb, ol } = result;
  const author = (result.author_name || []).slice(0, 2).join(', ');

  // The Google lookup is independent of Open Library's, so start it now; it's used only if needed.
  const googlePick = googleEdition(result).catch(() => null);
  const workKey = ol?.key || (gb && await findWorkKey(gb));
  const { description: olDesc, edition: olEdition } = workKey ? await workDetails(workKey) : { description: '', edition: null };
  const gbEdition = olEdition?.region === 'us' ? null : await googlePick;

  const olRank = olEdition ? REGION_RANK[olEdition.region] : -1;
  const gbRank = gbEdition ? REGION_RANK[isbnRegion(gbEdition.isbn13)] : -1;
  const useGoogle = gbRank > olRank;
  const ed = useGoogle ? null : olEdition?.e;
  const gbUsed = useGoogle ? gbEdition : gb;
  const gbInfo = gbUsed?.gb.volumeInfo || {};

  const metadata = { kind: 'book', author };
  const year = ol?.first_publish_year || gb?.first_publish_year;
  if (year) metadata.year = year;
  if (workKey) Object.assign(metadata, { ol_key: workKey, openlibrary_url: 'https://openlibrary.org' + workKey });
  if (gbUsed) Object.assign(metadata, { google_id: gbUsed.gb.id, google_books_url: `https://books.google.com/books?id=${gbUsed.gb.id}` });

  let isbn13;
  if (ed) {
    isbn13 = olEdition.isbn13;
    metadata.ol_edition = ed.key;
    if (ed.physical_format) metadata.format = ed.physical_format.replace(/^\w/, c => c.toUpperCase());
    if (ed.publishers?.[0]) metadata.publisher = ed.publishers[0];
    if (ed.publish_date) metadata.edition_date = ed.publish_date;
  } else if (gbUsed) {
    isbn13 = gbUsed.isbn13;
    if (gbInfo.publisher) metadata.publisher = gbInfo.publisher;
    if (gbInfo.publishedDate) metadata.edition_date = gbInfo.publishedDate;
  }
  if (isbn13) metadata.isbn = isbn13;
  const pages = ed?.number_of_pages || (useGoogle && gbInfo.pageCount) || ol?.number_of_pages_median || gb?.gb.volumeInfo?.pageCount;
  if (pages) metadata.pages = pages;

  const cover = (ed?.covers?.[0] > 0 && `https://covers.openlibrary.org/b/id/${ed.covers[0]}-L.jpg`) || gbUsed?.coverUrl || olCover(ol);
  if (cover) metadata.cover = cover;
  Object.assign(metadata, referenceLinks(isbn13, result.title, author));

  const description = olDesc || htmlToText(gbInfo.description || gb?.gb.volumeInfo?.description);
  const sourceUrl = metadata.openlibrary_url || metadata.google_books_url;
  const sourceTitle = metadata.openlibrary_url ? 'Open Library' : 'Google Books';
  return { author, metadata, description, cover, sourceUrl, sourceTitle };
}
