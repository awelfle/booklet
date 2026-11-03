// Settings for your copy of Booklet. Everything here is optional.
//
// To keep personal values out of git, put them in `config.local.js` at the repo root (it's ignored)
// using the same exports; `scripts/deploy.sh` swaps it in for this file when deploying.

// Google Books API key: improves search for brand-new books. Without one, Booklet uses Open Library only.
// Use a browser key restricted in Google Cloud to your site's URL and the Books API (see README).
export const GOOGLE_BOOKS_KEY = '';

// Channel slugs to use when Settings has none saved, e.g. so a new home-screen copy only needs a token:
// { toread: 'books-to-read-…', reading: 'books-reading-…', read: 'books-read-…' }
export const DEFAULT_CHANNELS = {};

// Filled in by `git archive` (see .gitattributes), so a deploy always reports its commit.
const STAMP = '$Format:%cs %h$';
export const VERSION = STAMP.startsWith('$') ? 'dev' : STAMP;
