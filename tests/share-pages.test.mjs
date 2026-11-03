import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathOf, render, pages, writePages} from '../tools/share-pages.mjs';

const nov = Date.UTC(2026, 10, 2, 12);
test('a post files under its blog and the month it was published, Irish time', () => {
  assert.equal(pathOf({slug: 'dei-at-facebook', blogId: 'project-management', publishedAt: nov}), 'project-management/2026/11/dei-at-facebook');
  assert.equal(pathOf({slug: 'late', blogId: 'pm', publishedAt: Date.UTC(2026, 9, 31, 23, 30)}), 'pm/2026/10/late');   // 23:30 UTC on 31 Oct is still October in Dublin
  assert.equal(pathOf({slug: 'loose', createdAt: nov}), '2026/11/loose');   // a post with no blog keeps the bare date address
});
test('a post page carries the blog card headed with the post title and hands the address to the app', () => {
  const html = render('project-management/2026/11/dei-at-facebook', {title: 'DEI at "FaceBook"'});
  assert.match(html, /<title>DEI at &quot;FaceBook&quot; — UCD blog<\/title>/);
  assert.match(html, /property="og:title" content="DEI at &quot;FaceBook&quot; — UCD blog"/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /property="og:image" content="https:\/\/www\.stouras\.com\/ucd-blog\/og-image\.jpg"/);
  assert.match(html, /property="og:url" content="https:\/\/www\.stouras\.com\/ucd-blog\/project-management\/2026\/11\/dei-at-facebook"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /href="\.\.\/\.\.\/\.\.\/\.\.\/favicon\.ico/);
  assert.match(html, /url=https:\/\/www\.stouras\.com\/ucd-blog\/\?redirect=%2Fucd-blog%2Fproject-management%2F2026%2F11%2Fdei-at-facebook"/);
});
test('a blog page is one segment deep and carries the blog description', () => {
  const html = render('project-management', {title: 'UCD Project Management Blog', description: 'Posts on <projects>.'});
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:title" content="UCD Project Management Blog — UCD blog"/);
  assert.match(html, /property="og:description" content="Posts on &lt;projects&gt;\."/);
  assert.match(html, /href="\.\.\/favicon\.ico/);
  assert.match(html, /url=https:\/\/www\.stouras\.com\/ucd-blog\/\?redirect=%2Fucd-blog%2Fproject-management"/);
});
test('the hand-over script finds the app root from the page address, whatever the mount', () => {
  const handOver = (path, pathname) => {
    const js = render(path).match(/<script>([\s\S]*?)<\/script>/)[1];
    let to; new Function('location', js)({pathname, search: '?local', hash: '#c-1', replace: u => { to = u; }});
    return to.replace(/&_=\d+$/, '');
  };
  assert.equal(handOver('pm/2026/11/x', '/ucd-blog/pm/2026/11/x/'), '/ucd-blog/?redirect=' + encodeURIComponent('/ucd-blog/pm/2026/11/x?local#c-1'));
  assert.equal(handOver('pm/2026/11/x', '/pm/2026/11/x/'), '/?redirect=' + encodeURIComponent('/pm/2026/11/x?local#c-1'));   // a dev server mounts the app at /
  assert.equal(handOver('2026/11/x', '/ucd-blog/2026/11/x/'), '/ucd-blog/?redirect=' + encodeURIComponent('/ucd-blog/2026/11/x?local#c-1'));
  assert.equal(handOver('pm', '/ucd-blog/pm/'), '/ucd-blog/?redirect=' + encodeURIComponent('/ucd-blog/pm?local#c-1'));
  assert.equal(handOver('pm', '/ucd-blog/pm'), '/ucd-blog/?redirect=' + encodeURIComponent('/ucd-blog/pm?local#c-1'));   // without the trailing slash too
});
test('a page is wanted per blog and per published post with a usable address', () => {
  const w = pages({blogs: [{id: 'pm', title: 'PM'}, {id: 'Bad Name', title: 'x'}], posts: [
    {slug: 'a', blogId: 'pm', status: 'published', publishedAt: nov}, {slug: 'b', blogId: 'pm', status: 'draft', publishedAt: nov},
    {slug: 'bad slug', blogId: 'pm', status: 'published', publishedAt: nov}, {slug: 'c', blogId: '../x', status: 'published', publishedAt: nov},
    {slug: 'loose', status: 'published', publishedAt: nov}]});
  assert.deepEqual([...w.keys()], ['pm', 'pm/2026/11/a', '2026/11/loose']);
});
test('pages are written and stale generated ones removed, foreign files kept, empty folders pruned', () => {
  const root = mkdtempSync(join(tmpdir(), 'share-pages-'));
  mkdirSync(join(root, 'pm/2026/10/mine'), {recursive: true}); writeFileSync(join(root, 'pm/2026/10/mine/index.html'), '<!doctype html>hand-written');
  mkdirSync(join(root, 'vendor')); writeFileSync(join(root, 'vendor/index.html'), '<!doctype html>a library');
  let r = writePages({blogs: [{id: 'pm', title: 'PM'}], posts: [{slug: 'a', blogId: 'pm', status: 'published', publishedAt: nov}, {slug: 'loose', status: 'published', publishedAt: nov}]}, root);
  assert.deepEqual(r, {written: ['pm', 'pm/2026/11/a', '2026/11/loose'], removed: [], total: 3});
  for (const f of ['pm/index.html', 'pm/2026/11/a/index.html', '2026/11/loose/index.html']) assert.ok(existsSync(join(root, f)), f);
  r = writePages({blogs: [], posts: [{slug: 'c', blogId: 'pm', status: 'published', publishedAt: nov}]}, root);
  assert.deepEqual({...r, removed: [...r.removed].sort()}, {written: ['pm/2026/11/c'], removed: ['2026/11/loose', 'pm', 'pm/2026/11/a'], total: 1});
  assert.ok(!existsSync(join(root, '2026')), 'the empty year folder is pruned');
  assert.ok(!existsSync(join(root, 'pm/2026/11/a')) && !existsSync(join(root, 'pm/index.html')));
  assert.equal(readFileSync(join(root, 'pm/2026/10/mine/index.html'), 'utf8'), '<!doctype html>hand-written');
  assert.equal(readFileSync(join(root, 'vendor/index.html'), 'utf8'), '<!doctype html>a library');
  assert.deepEqual(writePages({posts: [{slug: 'c', blogId: 'pm', status: 'published', publishedAt: nov}]}, root).written, []);   // unchanged pages are left alone
});
