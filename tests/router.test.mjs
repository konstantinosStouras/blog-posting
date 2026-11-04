// The pure parts of router.js: turning an address into an app route and back,
// and working out where a visitor was heading when the host's 404 page or an
// old #/route brought them to the app root.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeOf, href, restoreTarget} from '../router.js';
import {isReservedUrlName} from '../util.js';

test('routeOf strips the mount point and housekeeping parameters', () => {
  assert.equal(routeOf('/ucd-blog/project-management', '', '/ucd-blog'), '/project-management');
  assert.equal(routeOf('/ucd-blog/', '', '/ucd-blog'), '/');
  assert.equal(routeOf('/ucd-blog', '', '/ucd-blog'), '/');
  assert.equal(routeOf('/ucd-blog/index.html', '', '/ucd-blog'), '/');
  assert.equal(routeOf('/x', '?trend=sustainability&tag=ESG%2CSupply+Chain', ''), '/x?trend=sustainability&tag=ESG%2CSupply+Chain');
  assert.equal(routeOf('/posts', '?local', ''), '/posts');
  assert.equal(routeOf('/admin/people', '?module=bmgt45540&local', ''), '/admin/people?module=bmgt45540');
  assert.equal(routeOf('/ucd-blog/instructor/posts', '?redirect=x&_=123&blog=pm', '/ucd-blog'), '/instructor/posts?blog=pm');
});

test('href mounts a route and tolerates one that is already mounted', () => {
  assert.equal(href('/x', '/ucd-blog'), '/ucd-blog/x');
  assert.equal(href('/', '/ucd-blog'), '/ucd-blog/');
  assert.equal(href('/ucd-blog/2026/10/post', '/ucd-blog'), '/ucd-blog/2026/10/post');
  assert.equal(href('/x', ''), '/x');
  assert.equal(href('posts?trend=y', ''), '/posts?trend=y');
});

test('restoreTarget reads the 404 hand-over and legacy hash routes', () => {
  const root = '/ucd-blog', origin = 'https://www.stouras.com';
  assert.equal(restoreTarget('', '', root, origin), null);
  assert.equal(restoreTarget('', '#comments', root, origin), null);
  assert.deepEqual(restoreTarget('?redirect=%2Fucd-blog%2Fproject-management%3Ftrend%3Dai&_=1', '', root, origin), {route: '/project-management?trend=ai', local: false, hash: ''});
  assert.deepEqual(restoreTarget('?redirect=%2Fucd-blog%2F2026%2F10%2Fpost%23comments', '', root, origin), {route: '/2026/10/post', local: false, hash: '#comments'});
  assert.deepEqual(restoreTarget('', '#/admin/feedback', root, origin), {route: '/admin/feedback', local: false, hash: ''});
  assert.deepEqual(restoreTarget('', '#/posts?trend=sustainability&org=Ryanair', root, origin), {route: '/posts?trend=sustainability&org=Ryanair', local: false, hash: ''});
  assert.deepEqual(restoreTarget('?local', '#/operations', '', 'http://127.0.0.1:8787'), {route: '/operations', local: true, hash: ''});
  assert.deepEqual(restoreTarget('?redirect=%2Fposts%3Flocal', '', '', 'http://127.0.0.1:8787'), {route: '/posts', local: true, hash: ''});
});

test('a blog may not take the name of a page of the site', () => {
  for (const n of ['posts', 'blogs', 'admin', 'review', 'instructor', 'write', 'my-modules', 'invite', 'Blog']) assert.equal(isReservedUrlName(n), true, n);
  for (const n of ['project-management', 'operations', 'pm-2027', '']) assert.equal(isReservedUrlName(n), false, n);
});

test('malformed and off-site redirect targets cannot break startup or leave the mount', () => {
  for (const target of ['https://[', 'https://example.org/private', '//example.org', '/%2fexample.org', '/%5cexample.org']) {
    assert.equal(restoreTarget('?redirect=' + encodeURIComponent(target), '', ''), null);
  }
});
