import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookKey, cleanAuthors, mergeResults } from '../js/search.js';
import { isbn10to13, isbn13to10, starStr, fmtDate, safeUrl } from '../js/util.js';

test('bookKey ignores leading articles and first names', () => {
  assert.equal(bookKey({ title: 'The Wager', author_name: ['David Grann'] }), bookKey({ title: 'Wager', author_name: ['Grann'] }));
});

test('cleanAuthors drops descriptors', () => {
  assert.deepEqual(cleanAuthors(['qntm (Author of science fiction)']), ['qntm']);
});

test('mergeResults merges sources and ranks the exact title first', () => {
  const gb = [{ source: 'gb', gb: {}, title: 'A Wall Is Also a Road', author_name: ['Annalee Newitz'], isbn13: '9781250228055' }];
  const ol = [
    { source: 'ol', title: 'Study Guide', author_name: ['SuperSummary'] },
    { source: 'ol', key: '/works/X', title: 'A Wall Is Also a Road', author_name: ['Annalee Newitz'] },
  ];
  const rows = mergeResults('a wall is also a road', ol, gb);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'A Wall Is Also a Road');
  assert.ok(rows[0].gb && rows[0].ol, 'both sources merged into one row');
});

test('mergeResults handles a source still loading', () => {
  assert.deepEqual(mergeResults('x', null, null), []);
});

test('ISBN conversions round-trip', () => {
  assert.equal(isbn10to13('163557563X'), '9781635575637');
  assert.equal(isbn13to10('9781635575637'), '163557563X');
  assert.equal(isbn13to10('9798514084241'), null);
});

test('starStr clamps bad ratings instead of throwing', () => {
  assert.equal(starStr(3), '★★★☆☆');
  assert.equal(starStr(9), '★★★★★');
  assert.equal(starStr('nope'), '☆☆☆☆☆');
});

test('fmtDate leaves non-ISO dates as typed', () => {
  assert.equal(fmtDate('11/2/2026'), '11/2/2026');
  assert.equal(fmtDate(''), '');
});

test('safeUrl only allows http(s)', () => {
  assert.equal(safeUrl('https://bookshop.org/x'), 'https://bookshop.org/x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
});
