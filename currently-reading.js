/*
  Currently Reading — drop-in widget for your site.

  <div data-currently-reading="your-reading-channel-slug"></div>
  <script src="/currently-reading.js" defer></script>

  Reads the public/closed Are.na channel without a token, so nothing secret
  ships to the browser. Results are cached in sessionStorage for 10 minutes.
  Style it with the .cr-* classes; the defaults inherit your site's fonts and colors.
  Self-contained on purpose (no imports) so it can be dropped into any site.
*/
(() => {
  const TTL = 10 * 60 * 1000;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function getBooks(slug) {
    const key = 'cr:' + slug;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key));
      if (hit && Date.now() - hit.t < TTL) return hit.books;
    } catch {}
    const r = await fetch(`https://api.are.na/v3/channels/${encodeURIComponent(slug)}/contents?per=10`);
    if (!r.ok) throw new Error(r.status);
    // Most recently started first; the shelf's own order breaks ties.
    const books = (await r.json()).data
      .filter(d => d.base_type === 'Block')
      .map((d, i) => ({ d, i, started: d.connection?.metadata?.started || '' }))
      .sort((a, b) => b.started.localeCompare(a.started) || a.i - b.i)
      .map(({ d }) => ({
        title: d.title,
        author: d.metadata?.author || (d.description?.plain?.match(/^by (.+)/)?.[1] ?? ''),
        cover: d.image?.small?.src || d.metadata?.cover || null,
        url: d.source?.url || `https://www.are.na/block/${d.id}`,
      }));
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), books })); } catch {}
    return books;
  }

  const css = `
    .cr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .cr-book { display: flex; gap: 12px; align-items: center; }
    .cr-book a { color: inherit; text-decoration: none; display: contents; }
    .cr-cover { width: 44px; height: 66px; object-fit: cover; border-radius: 2px; flex: none;
      box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.08); background: rgba(127,127,127,.15); }
    .cr-title { font-weight: 600; line-height: 1.25; }
    .cr-author { opacity: .65; font-size: .9em; margin-top: 2px; }
    .cr-empty { opacity: .65; }`;

  function render(el, books) {
    if (!books.length) { el.innerHTML = `<p class="cr-empty">${esc(el.dataset.empty || 'Between books.')}</p>`; return; }
    el.innerHTML = `<ul class="cr-list">${books.map(b => `
      <li class="cr-book"><a href="${esc(b.url)}" target="_blank" rel="noopener">
        ${b.cover ? `<img class="cr-cover" src="${esc(b.cover)}" alt="" loading="lazy">` : '<span class="cr-cover"></span>'}
        <span><span class="cr-title">${esc(b.title)}</span>${b.author ? `<span class="cr-author" style="display:block">${esc(b.author)}</span>` : ''}</span>
      </a></li>`).join('')}</ul>`;
  }

  function init() {
    const els = document.querySelectorAll('[data-currently-reading]');
    if (!els.length) return;
    if (!document.getElementById('cr-style')) {
      const s = document.createElement('style'); s.id = 'cr-style'; s.textContent = css;
      document.head.prepend(s);
    }
    els.forEach(el => getBooks(el.dataset.currentlyReading)
      .then(books => render(el, books))
      .catch(() => { el.innerHTML = ''; }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
