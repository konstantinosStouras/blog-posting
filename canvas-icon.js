const colours = ['#14635e', '#563b89', '#91421e', '#285585', '#80385e'];

// The same icon appears in the live app and on the static page for a shared link.
export function faviconFor(blog, root = '') {
  if (!blog) return root + 'favicon.svg?v=2';
  if (blog.id === 'project-management' || blog.id === 'oim-blog') {
    return root + blog.id + '/favicon.svg';
  }
  const words = (blog.title || blog.id || '').normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
  const significant = words.filter(word => !/^(ucd|blogs?|the|and|of|for|in)$/i.test(word));
  const initials = (significant.length ? significant : words).slice(0, 2)
    .map(word => [...word][0]).join('').toUpperCase() || 'B';
  let hash = 0;
  for (const letter of blog.id || '') hash = (hash * 31 + letter.codePointAt(0)) >>> 0;
  const colour = colours[hash % colours.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${colour}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="white" font-family="Arial,sans-serif" font-size="36" font-weight="bold">${initials}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
