import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathOf, render, writePages} from '../tools/share-pages.mjs';

const nov = Date.UTC(2026, 10, 2, 12);
test('a post files under the month it was published, Irish time', () => {
  assert.equal(pathOf({slug: 'dei-at-facebook', publishedAt: nov}), '2026/11/dei-at-facebook');
  assert.equal(pathOf({slug: 'late', publishedAt: Date.UTC(2026, 9, 31, 23, 30)}), '2026/10/late');   // 23:30 UTC on 31 Oct is still October in Dublin
  assert.equal(pathOf({slug: 'draft-dated', createdAt: nov}), '2026/11/draft-dated');
});
test('the page carries the blog card and hands the address to the app', () => {
  const html = render({slug: 'dei-at-facebook', publishedAt: nov});
  assert.match(html, /property="og:image" content="https:\/\/www\.stouras\.com\/ucd-blog\/og-image\.jpg"/);
  assert.match(html, /property="og:url" content="https:\/\/www\.stouras\.com\/ucd-blog\/2026\/11\/dei-at-facebook"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /location\.replace\(root \+ '\?redirect='/);
  assert.match(html, /url=https:\/\/www\.stouras\.com\/ucd-blog\/\?redirect=%2Fucd-blog%2F2026%2F11%2Fdei-at-facebook/);
});
test('pages are written for published posts only, stale generated ones removed, foreign files kept', () => {
  const root = mkdtempSync(join(tmpdir(), 'share-pages-'));
  mkdirSync(join(root, '2026/10/mine'), {recursive: true}); writeFileSync(join(root, '2026/10/mine/index.html'), '<!doctype html>hand-written');
  let r = writePages([{slug: 'a', status: 'published', publishedAt: nov}, {slug: 'b', status: 'draft', publishedAt: nov}, {slug: 'bad slug', status: 'published', publishedAt: nov}], root);
  assert.deepEqual(r, {written: ['2026/11/a'], removed: [], total: 1});
  assert.ok(existsSync(join(root, '2026/11/a/index.html')));
  r = writePages([{slug: 'c', status: 'published', publishedAt: nov}], root);
  assert.deepEqual(r, {written: ['2026/11/c'], removed: ['2026/11/a'], total: 1});
  assert.ok(!existsSync(join(root, '2026/11/a')));
  assert.equal(readFileSync(join(root, '2026/10/mine/index.html'), 'utf8'), '<!doctype html>hand-written');
  assert.deepEqual(writePages([{slug: 'c', status: 'published', publishedAt: nov}], root).written, []);   // unchanged pages are left alone
});
