import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isbnRegion, pickEdition } from '../js/editions.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}-editions.json`, import.meta.url)));

test('isbnRegion', () => {
  assert.equal(isbnRegion('9780593321201'), 'us');      // Knopf U.S.
  assert.equal(isbnRegion('9798514084241'), 'us');      // 979-8 is U.S.-only
  assert.equal(isbnRegion('9780735243347'), 'non-us');  // Knopf Canada
  assert.equal(isbnRegion('9780241843130'), 'non-us');  // DK U.K.
  assert.equal(isbnRegion('9788417918484'), 'non-us');  // Spanish ISBN group
  assert.equal(isbnRegion('9780369774071'), 'unknown');
  assert.equal(isbnRegion(undefined), 'unknown');
});

// Real Open Library edition lists, saved 2026-11-02. Each was a real mix-up at some point.
test('Piranesi → Bloomsbury USA hardcover, not the U.K. one', () => {
  const pick = pickEdition(fixture('piranesi'));
  assert.equal(pick.isbn13, '9781635575637');
  assert.equal(pick.region, 'us');
});

test('Tomorrow, and Tomorrow, and Tomorrow → Knopf U.S., not Knopf Canada', () => {
  assert.equal(pickEdition(fixture('tomorrow')).isbn13, '9780593321201');
});

test('The Employees → New Directions, not the U.K. edition', () => {
  assert.match(pickEdition(fixture('employees')).isbn13, /^9780811/);
});

test('format filter is word-bounded', () => {
  const ed = (isbn, extra) => ({ key: isbn, isbn_13: [isbn], ...extra });
  const pick = pickEdition([
    ed('9780000000001', { physical_format: 'Audio CD' }),
    ed('9780000000002', { physical_format: 'Hardcover', publishers: ['McDonald & Woodward'] }),
  ]);
  assert.equal(pick.isbn13, '9780000000002');
});

test('no usable editions → null', () => {
  assert.equal(pickEdition([{ isbn_13: ['9788411481489'], languages: [{ key: '/languages/spa' }] }]), null);
});
