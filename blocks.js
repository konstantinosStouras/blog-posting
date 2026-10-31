// Rich blocks a post can contain, stored as plain sanitised HTML with the source in
// data attributes, and brought to life wherever the body is shown (post page,
// preview, and the writer itself):
//   <pre data-lang="python"><code>…</code></pre>          code block (highlight.js)
//   <div class="math" data-tex="\frac{a}{b}"></div>         LaTeX (KaTeX)
//   <div class="tv-chart" data-symbol="NASDAQ:AAPL" data-interval="D"></div>
//                                                           live TradingView chart
//   <div class="poll" data-poll='{"id":…,"q":…,"options":[…],"days":7,"hide":false}'></div>
//   <sup class="fn"><a href="#fn-1" id="fnref-1">1</a></sup> + <section class="footnotes">
// Libraries load from cdnjs only when a page actually contains such a block.
import {esc, newId, toast} from './util.js';

const CDN = {
  hljsCss: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
  hljs: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  katexCss: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.css',
  katex: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js',
};
const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.onload = res; s.onerror = () => rej(Error('Could not load ' + src)); document.head.append(s); }));
  return loaded.get(src);
}
function loadCss(href) { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.crossOrigin = 'anonymous'; l.referrerPolicy = 'no-referrer'; document.head.append(l); } }
export const katex = () => { loadCss(CDN.katexCss); return loadScript(CDN.katex).then(() => window.katex); };
export const hljs = () => { loadCss(CDN.hljsCss); return loadScript(CDN.hljs).then(() => window.hljs); };

export const LANGUAGES = [['auto', 'Auto-detect'], ['plaintext', 'Plain text'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['python', 'Python'], ['r', 'R'], ['sql', 'SQL'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['bash', 'Bash / shell'], ['html', 'HTML'], ['css', 'CSS'], ['json', 'JSON'], ['yaml', 'YAML'], ['markdown', 'Markdown'], ['matlab', 'MATLAB'], ['julia', 'Julia'], ['latex', 'LaTeX'], ['excel', 'Excel formulas']];
export const langName = code => (LANGUAGES.find(l => l[0] === code) || LANGUAGES[0])[1];
export const SYMBOL_RE = /^[A-Z0-9][A-Z0-9:._-]{0,30}$/;
export const INTERVALS = [['D', 'Daily'], ['W', 'Weekly'], ['M', 'Monthly'], ['60', 'Hourly']];

// ---------- parsing / serialising helpers ----------
export const readPoll = el => { try { const p = JSON.parse(el.dataset.poll || '{}'); return {id: p.id || newId(), q: String(p.q || 'New poll').slice(0, 300), options: (Array.isArray(p.options) ? p.options : []).map(o => String(o).slice(0, 120)).filter(Boolean).slice(0, 10), days: Math.min(365, Math.max(0, +p.days || 0)), hide: !!p.hide}; } catch { return {id: newId(), q: 'New poll', options: [], days: 0, hide: false}; } };
export const writePoll = p => JSON.stringify({id: p.id, q: p.q, options: p.options, days: p.days, hide: p.hide});
export const tvUrl = (symbol, interval = 'D') => `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=f1f3f6&theme=light&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&locale=en`;

// Returns a clone of `root` with every rendered widget reduced to its stored source,
// so what is saved is small, sanitiser-safe HTML and never a KaTeX/iframe DOM.
export function serialize(root) {
  const c = root.cloneNode(true);
  c.querySelectorAll('.math, .tv-chart, .poll').forEach(el => { el.innerHTML = ''; el.removeAttribute('contenteditable'); el.removeAttribute('data-rendered'); el.classList.remove('selected'); });
  c.querySelectorAll('pre').forEach(pre => { pre.removeAttribute('contenteditable'); pre.removeAttribute('data-rendered'); const code = pre.querySelector('code'); if (code) { code.removeAttribute('class'); code.textContent = code.textContent; } });
  c.querySelectorAll('.lang-tag, .widget-tools').forEach(el => el.remove());
  return c.innerHTML;
}

// ---------- enhancement (post page, preview, writer) ----------
// opts: {editor: true} renders widgets as uneditable cards with an Edit affordance;
//       {post, user, store} enables poll voting on the post page.
export async function enhance(root, opts = {}) {
  if (!root) return;
  const editor = !!opts.editor;
  // code blocks
  const pres = [...root.querySelectorAll('pre')];
  if (pres.length) {
    let H = null; try { H = await hljs(); } catch (e) { console.warn(e); }
    for (const pre of pres) {
      let code = pre.querySelector('code'); if (!code) { code = document.createElement('code'); code.textContent = pre.textContent; pre.textContent = ''; pre.append(code); }
      const lang = pre.dataset.lang || 'auto';
      if (H && !editor) { const src = code.textContent; try { const r = lang === 'auto' || lang === 'plaintext' ? (lang === 'auto' ? H.highlightAuto(src) : null) : H.highlight(src, {language: lang, ignoreIllegals: true}); if (r) { code.innerHTML = r.value; code.className = 'hljs'; } } catch {} }
      if (editor) { pre.querySelector('.lang-tag')?.remove(); const tag = document.createElement('span'); tag.className = 'lang-tag'; tag.contentEditable = 'false'; tag.textContent = langName(lang); pre.prepend(tag); }
      else if (lang !== 'auto' && lang !== 'plaintext') pre.setAttribute('data-label', langName(lang));
    }
  }
  // LaTeX
  const maths = [...root.querySelectorAll('.math')];
  if (maths.length) {
    let K = null; try { K = await katex(); } catch (e) { console.warn(e); }
    for (const el of maths) {
      const tex = el.dataset.tex || '';
      el.innerHTML = '';
      if (editor) el.contentEditable = 'false';
      if (!tex) { el.innerHTML = `<span class="math-empty">${editor ? 'EDIT &amp; ENTER LATEX EXPRESSIONS HERE' : ''}</span>`; continue; }
      if (K) { try { K.render(tex, el, {displayMode: true, throwOnError: false}); } catch { el.textContent = tex; } } else el.textContent = tex;
    }
  }
  // Financial charts (TradingView). The symbol is validated before it reaches a URL.
  for (const el of root.querySelectorAll('.tv-chart')) {
    const symbol = String(el.dataset.symbol || '').toUpperCase(), interval = INTERVALS.some(i => i[0] === el.dataset.interval) ? el.dataset.interval : 'D';
    el.innerHTML = '';
    if (editor) el.contentEditable = 'false';
    if (!SYMBOL_RE.test(symbol)) { el.innerHTML = '<p class="muted small">Financial chart: choose a symbol.</p>'; continue; }
    const f = document.createElement('iframe'); f.src = tvUrl(symbol, interval); f.title = `${symbol} chart`; f.loading = 'lazy'; f.setAttribute('allowtransparency', 'true'); f.setAttribute('frameborder', '0'); f.setAttribute('allowfullscreen', '');
    el.append(f);
    const cap = document.createElement('p'); cap.className = 'tv-caption'; cap.innerHTML = `${esc(symbol)} · live data. Created with <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a>`; el.append(cap);
  }
  // Polls
  for (const el of root.querySelectorAll('.poll')) renderPoll(el, opts);
  // Footnotes: back-links and numbering stay in step with the markers.
  renumberFootnotes(root, editor);
}

export function renumberFootnotes(root, editor = false) {
  const refs = [...root.querySelectorAll('sup.fn a')], list = root.querySelector('section.footnotes ol');
  refs.forEach((a, i) => { const n = i + 1; a.textContent = n; a.href = `#fn-${n}`; a.id = `fnref-${n}`; });
  if (list) [...list.children].forEach((li, i) => { const n = i + 1; li.id = `fn-${n}`; if (!editor && !li.querySelector('a.fn-back')) { const back = document.createElement('a'); back.className = 'fn-back'; back.href = `#fnref-${n}`; back.textContent = '↩'; back.setAttribute('aria-label', 'Back to text'); li.append(' ', back); } });
}

async function renderPoll(el, opts) {
  const p = readPoll(el); el.dataset.poll = writePoll(p);
  el.innerHTML = '';
  if (opts.editor) {
    el.contentEditable = 'false';
    el.innerHTML = `<div class="poll-card"><div class="poll-kicker">Poll</div><h4>${esc(p.q)}</h4>${(p.options.length ? p.options : ['Option 1', 'Option 2']).map(o => `<div class="poll-opt">${esc(o)}</div>`).join('')}<p class="hint">${p.days ? `Open for ${p.days} day${p.days === 1 ? '' : 's'} after publishing` : 'Open indefinitely'}${p.hide ? ' · vote counts hidden' : ''}</p><button type="button" class="poll-edit" data-edit-poll aria-label="Edit poll" title="Edit poll">✎</button></div>`;
    return;
  }
  const {post, user, store} = opts;
  const closesAt = p.days && post?.publishedAt ? post.publishedAt + p.days * 86400000 : 0, closed = closesAt && Date.now() > closesAt;
  let votes = {counts: {}, mine: null, total: 0};
  if (post?.id && store) { try { votes = await store.pollVotes(post.id, p.id, user); } catch (e) { console.warn(e); } }
  const draw = () => {
    const total = votes.total, show = votes.mine !== null || closed || opts.preview;
    el.innerHTML = `<div class="poll-card"><div class="poll-kicker">Poll${closed ? ' · closed' : closesAt ? ` · closes ${new Date(closesAt).toLocaleDateString('en-IE', {day: 'numeric', month: 'short'})}` : ''}</div><h4>${esc(p.q)}</h4>
      ${p.options.map((o, i) => { const n = votes.counts[i] || 0, pct = total ? Math.round(n / total * 100) : 0; return `<button type="button" class="poll-opt ${votes.mine === i ? 'mine' : ''} ${show ? 'show' : ''}" data-opt="${i}" ${closed || opts.preview ? 'disabled' : ''}><span class="bar" style="width:${show && !p.hide ? pct : 0}%"></span><span class="lbl">${esc(o)}</span>${show && !p.hide ? `<span class="pct">${pct}%</span>` : ''}</button>`; }).join('')}
      <p class="hint">${p.hide ? (votes.mine !== null ? 'Thanks for voting.' : 'Vote counts are hidden.') : `${total} vote${total === 1 ? '' : 's'}`}${!user && !opts.preview ? ' · log in to vote' : ''}</p></div>`;
    el.querySelectorAll('[data-opt]').forEach(b => b.onclick = async () => {
      if (!user) { toast('Log in with your module invitation to vote.', 'error'); return; }
      try { votes = await store.votePoll(post.id, p.id, +b.dataset.opt, user); draw(); } catch (e) { toast(e.message, 'error'); }
    });
  };
  draw();
}
