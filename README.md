<p align="center">
  <a href="https://booklet.lol">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="site/banner-dark.jpg">
      <img alt="Booklet — your reading list, kept on Are.na" src="site/banner-light.jpg" width="800">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://booklet.lol"><strong>booklet.lol</strong></a> ·
  <a href="#set-up-your-own-copy">Set up your own copy</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#currently-reading-on-your-website">Website widget</a>
</p>

**Booklet** is a small reading tracker for your phone that keeps your books on [Are.na](https://www.are.na).
Three shelves — **To Read**, **Reading** and **Read** — each an Are.na channel you own.

- **Finds the book.** Searches Open Library and Google Books together, so new releases, typos and ISBNs all turn up.
- **Saves the right edition.** The U.S. print edition, hardcover first, with cover, publisher, pages and links
  to Bookshop, Amazon and Open Library.
- **Dates and ratings.** Booklet notes when you start and finish; rate it when you're done, fix dates any time.
- **Lives on your home screen.** Light and dark, made for one thumb.
- **No server, no new account.** A static page that talks to Are.na with your own token, which never leaves
  your device. Free and open source.

<p align="center">
  <img src="site/screens/shelf.jpg" alt="The Read shelf with covers, star ratings and finish dates" width="240">
  &nbsp;
  <img src="site/screens/book.jpg" alt="A book's details: edition, start date, links and actions" width="240">
  &nbsp;
  <img src="site/screens/dark.jpg" alt="The To Read shelf in dark mode" width="240">
</p>

> Booklet is an independent project and isn't affiliated with Are.na.

## How it works

- **Are.na is the database.** Each shelf is a channel you own (created as *closed*: anyone can view it,
  only you can add). Each book is a block — an image block of the cover, with the book's details stored
  as block metadata. Moving a book between shelves moves its connection; the dates and your rating live
  on that connection.
- **Search uses Open Library and Google Books together.** Google is better at finding books (new
  releases, typos); Open Library is better at picking the edition. Booklet merges both and saves the
  **U.S. English print edition, hardcover first**, using ISBN and publisher clues.
- **Your token stays on your device.** It's saved in the browser's local storage and only ever sent to
  Are.na.

### Do I need Are.na Premium?

No. Booklet doesn't use any Premium-only API features. Free accounts have lower API rate limits
(30 changes a minute, against 60 on Premium), which is plenty for tracking books.

## Set up your own copy

1. **Deploy it.** Fork this repo and deploy it to any static host. On Netlify:
   [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/awelfle/booklet)
   There's no build step: the publish directory is the repo root.
2. **Make an Are.na token** at [are.na/settings/personal-access-tokens](https://www.are.na/settings/personal-access-tokens)
   with **write** scope.
3. **Open your copy**, tap **Set up Booklet**, paste the token and tap **Create my shelves on Are.na**.
   (Already have channels you want to use? Paste their links instead and tap Save.)
4. **On iPhone:** Share → Add to Home Screen.

On iOS, a home-screen app doesn't share storage with Safari, so you'll paste the token once more there.
To skip re-entering your shelves on new devices, put their slugs in `DEFAULT_CHANNELS` (see below).

### Optional: a Google Books key

Without one, Booklet searches Open Library only, which is a little weaker on brand-new books.

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Books API**.
2. Create an **API key**. Restrict it to **Websites** → your copy's address (e.g. `https://books.example.com/*`)
   and to the **Books API**. It's safe in client code once restricted.
3. Put it in `GOOGLE_BOOKS_KEY` (below). Google's default quota is 1,000 searches a day.

### Settings: `js/config.js` and `config.local.js`

`js/config.js` holds the optional settings: `GOOGLE_BOOKS_KEY` and `DEFAULT_CHANNELS`. To keep your
values out of a public fork, copy `js/config.js` to `config.local.js` at the repo root (it's gitignored),
fill it in, and deploy with `scripts/deploy.sh`, which swaps it in. Or just edit `js/config.js` in a
private fork.

## "Currently reading" on your website

`currently-reading.js` is a self-contained widget that lists your Reading shelf on any site — no token
needed, since the channel is viewable by anyone:

```html
<div data-currently-reading="your-reading-channel-slug"></div>
<script src="https://YOUR-BOOKLET-COPY/currently-reading.js" defer></script>
```

See `widget-demo.html`. Style it with the `.cr-*` classes.

## Development

Plain HTML, CSS and ES modules — no framework and no build step.

| Path | |
|---|---|
| `index.html`, `styles.css` | Markup and styles |
| `js/config.js` | Optional settings |
| `js/app.js` | UI: shelves, add-a-book search, book sheet, settings |
| `js/arena.js` | Are.na client and shelf rules |
| `js/search.js` | Google Books + Open Library search, merged per book |
| `js/editions.js` | Picks the edition to save and builds the stored record |
| `js/util.js` | Small shared helpers |
| `tests/` | Unit tests (`npm test`, Node 20+), with real Open Library edition lists as fixtures |
| `scripts/check-search.js` | Runs ~26 real searches through the app's code and prints what would be saved |
| `scripts/import-books.mjs` | Bulk-adds prepared books to a shelf |
| `scripts/deploy.sh` | Deploys a clean export to the linked Netlify site |
| `site/` | The booklet.lol landing page and README images (`banner.html` is the banner's source) |

```sh
python3 -m http.server 8000   # then open http://localhost:8000
npm test
node scripts/check-search.js  # after changing search.js or editions.js
```

## Credits

- Book data from [Open Library](https://openlibrary.org) and [Google Books](https://books.google.com).
- Book icon: [Material Symbols](https://fonts.google.com/icons) `book_5` (Apache 2.0).
- Wordmark: [Fraunces](https://fonts.google.com/specimen/Fraunces) (SIL Open Font License).

## License

MIT
