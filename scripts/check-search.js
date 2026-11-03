// Runs real searches through the app's own search, merge and edition code and reports what a tap
// on the top result would save. Use it after changing search.js or editions.js.
//
//   node scripts/check-search.js
//
// Uses GOOGLE_BOOKS_KEY from js/config.js (or config.local.js when deploying). A key restricted to your
// site only answers requests from it, so set BOOKLET_SITE to that address, e.g.
//   BOOKLET_SITE=https://books.example.com/ node scripts/check-search.js

import { searchOpenLibrary, searchGoogleBooks, mergeResults } from '../js/search.js';
import { bookRecord, isbnRegion } from '../js/editions.js';
import { norm, stripArticle } from '../js/util.js';

const site = process.env.BOOKLET_SITE;
if (site) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) => String(url).includes('googleapis.com')
    ? realFetch(url, { ...opts, headers: { ...opts.headers, Referer: site } })
    : realFetch(url, opts);
}

// [query as typed, expected title]
const CASES = [
  ['a wall is also a road', 'A Wall Is Also a Road'], ['automatic noodle', 'Automatic Noodle'],
  ['the incandescent tesh', 'The Incandescent'], ['atmosphere taylor jenkins reid', 'Atmosphere'],
  ['onyx storm', 'Onyx Storm'], ['careless people', 'Careless People'], ['james percival everett', 'James'],
  ['intermezzo rooney', 'Intermezzo'], ['the wager', 'The Wager'], ['project hail mary', 'Project Hail Mary'],
  ['piranesi', 'Piranesi'], ['tomorrow and tomorrow and tomorrow', 'Tomorrow, and Tomorrow, and Tomorrow'],
  ['middlemarch', 'Middlemarch'], ['left hand of darkness', 'The Left Hand of Darkness'], ['the hobbit', 'The Hobbit'],
  ['braiding sweetgrass', 'Braiding Sweetgrass'], ['how to do nothing odell', 'How to Do Nothing'],
  ['the employees olga ravn', 'The Employees'], ['minor detail adania shibli', 'Minor Detail'],
  ['children of time', 'Children of Time'], ['ursula le guin dispossessed', 'The Dispossessed'],
  ['piranisi clarke', 'Piranesi'], ['middlemarsh', 'Middlemarch'], ['enshittification doctorow', 'Enshittification'],
  ['against convenience bullard', 'Against Convenience'], ['9781250228055', 'A Wall Is Also a Road'],
];

const same = (a, b) => stripArticle(norm(a)) === stripArticle(norm(b));
let first = 0;
for (const [q, expected] of CASES) {
  const [ol, gb] = await Promise.all([searchOpenLibrary(q).catch(() => []), searchGoogleBooks(q).catch(() => [])]);
  const rows = mergeResults(q, ol, gb);
  const rank = rows.findIndex(r => same(r.title, expected)) + 1;
  let picked = '';
  if (rank === 1) {
    first++;
    const m = (await bookRecord(rows[0])).metadata;
    picked = `${m.format || '-'} | ${m.publisher || '-'} | ${m.isbn || 'no ISBN'} [${isbnRegion(m.isbn)}]`;
  }
  console.log(`${String(rank || '—').padStart(2)}  ${q.padEnd(34)} ${picked}`);
}
console.log(`\nRight book first: ${first}/${CASES.length}`);
