// Small pure helpers shared by the app modules and scripts. No DOM access at import time.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only http(s) links from metadata become hrefs; anything else (javascript:, data:) is dropped.
export const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);

export const norm = t => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const stripArticle = t => t.replace(/^(the|a|an) /, '');

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const fmtDate = d => {
  if (!d) return '';
  if (!ISO_DATE.test(d)) return String(d); // edited by hand on Are.na; show as-is rather than "Invalid Date"
  return new Date(d + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const starStr = rating => {
  const n = Math.max(0, Math.min(5, Math.round(+rating) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

export function isbn10to13(i10) {
  const core = '978' + i10.slice(0, 9);
  const sum = [...core].reduce((s, d, i) => s + +d * (i % 2 ? 3 : 1), 0);
  return core + ((10 - sum % 10) % 10);
}

export function isbn13to10(i13) {
  if (!i13.startsWith('978')) return null;
  const core = i13.slice(3, 12);
  const sum = [...core].reduce((s, d, i) => s + +d * (10 - i), 0);
  const check = (11 - sum % 11) % 11;
  return core + (check === 10 ? 'X' : check);
}

// Google descriptions can contain basic HTML. (Outside a browser, e.g. in scripts, strip tags crudely.)
export const htmlToText = html => typeof DOMParser === 'undefined'
  ? String(html || '').replace(/<[^>]*>/g, '').trim()
  : new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim();
