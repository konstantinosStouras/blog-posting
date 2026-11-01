// The grading assistant's prompts, post-to-text conversion, reply parsing and
// table rows. Pure functions (no DOM, no network) so they run in `npm test`.
// The default persona and instructions are the prompts the maintainer used for
// years in a Google Sheet (reviewBlogText, gradeReviewBlogText, improveMyFeedback),
// with the exercise description replaced by each blog's own brief.

export const PLACEHOLDERS = ['{brief}', '{blogTitle}', '{module}', '{academicYear}', '{wordTarget}', '{title}', '{subtitle}', '{organisation}', '{category}', '{tags}', '{words}', '{penName}'];

export const DEFAULT_GRADER = {
  persona: `Act as a fair but strict business school professor reviewing student work in an MSc-level module ({module}, {academicYear}). You are reviewing a blog post written for the "{blogTitle}" blog. Be strict but fair: your voice reflects the standards of academic fairness, with a touch of encouragement when deserved. Refer directly to the student's work ("your post", "in your blog"). Avoid em dashes; use commas or parentheses instead.`,
  instructions: `Purpose
Evaluate a student's blog post for a course assignment by reviewing its quality and offering constructive feedback to support learning and improvement.

Provided Info
The assignment brief given to the students:
"""
{brief}
"""
Word target: {wordTarget}. The post should provide rich and original content with insights and recommendations, include hyperlinks to sources rather than end references, and adopt a blog tone rather than an academic style.

Output
1. grade: a number from 0 to 10 (one decimal allowed) reflecting the quality of the post against the brief. Be strict but fair.
2. summary: one or two sentences stating which organisation the post analyses, which topic or megatrend it focuses on, and the main recommendation.
3. feedback: a single paragraph of feedback addressed to the student, with both strengths and specific, actionable improvement suggestions. Mention specific areas that meet or fall short of the assignment expectations. If the post includes superficial or AI-generated content, flag it politely. If it demonstrates strong research or valuable business insights, applaud those efforts. Do not include a numeric grade in the feedback. No greeting, no sign-off.

Tone & Target
Respectful, objective and constructive, written for an individual MSc student in a professional academic setting, helping them understand how their work is evaluated and how they can improve in future assignments. Avoid em dashes; use commas or parentheses instead.

Post metadata: title "{title}"; subtitle "{subtitle}"; organisation studied: {organisation}; category: {category}; tags: {tags}; length: {words} words.`,
  polish: `Purpose
Help me improve the feedback I give to students by making it warmer, clearer and more constructive, while keeping my personal tone and style intact.

Role
Act as a business school professor revising your own feedback to a student to better reflect your values as a thoughtful, encouraging and professional educator.

Output
Rewrite the short feedback that I wrote. The revised version should sound like something I would naturally say to a student: clearer, more supportive and slightly more polished than the original. Refer to myself as "I" or "from my reading" and speak directly to the student using "you" or "your post". Keep small, human touches so the voice stays natural and personal. Do not include greetings or sign-offs. Avoid em dashes; use commas or parentheses instead. Reply with the rewritten feedback only.`,
};

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    grade: {type: 'number', description: 'Quality of the post from 0 to 10'},
    summary: {type: 'string', description: 'One or two sentences on what the post analyses'},
    feedback: {type: 'string', description: 'One paragraph of feedback addressed to the student'},
  },
  required: ['grade', 'summary', 'feedback'],
  additionalProperties: false,
};

const FORMAT_RULE = 'Reply with a single JSON object and nothing else: {"grade": <number 0-10>, "summary": "<one or two sentences>", "feedback": "<one paragraph>"}.';

export const fill = (template, vars) => String(template || '').replace(/\{([a-zA-Z]+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));

// Student HTML (already sanitised when saved) becomes readable text that keeps
// what the grader must see: headings, hyperlinks with their targets, lists,
// captions and the presence of images, charts, polls and formulas.
export function htmlToText(html = '') {
  let s = String(html);
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (m, alt) => `\n[Image${alt ? ': ' + alt : ''}]\n`).replace(/<img[^>]*>/gi, '\n[Image]\n');
  s = s.replace(/<div[^>]*class="[^"]*tv-chart[^"]*"[^>]*data-symbol="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi, (m, sym) => `\n[Live financial chart: ${sym}]\n`);
  s = s.replace(/<div[^>]*class="poll"[^>]*>/gi, '\n[Reader poll]\n');   // the wrapper only: the rendered question and options stay as text
  s = s.replace(/<(?:div|span)[^>]*class="[^"]*\bmath\b[^"]*"[^>]*data-tex="([^"]*)"[^>]*>[\s\S]*?<\/(?:div|span)>/gi, (m, tex) => `\n[Formula: ${tex}]\n`);
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (m, n, t) => `\n\n${'#'.repeat(+n)} ${t}\n\n`);
  s = s.replace(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/gi, '\nCaption: $1\n');
  s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, t) => { const text = t.replace(/<[^>]+>/g, '').trim(); return /^https?:/i.test(href) && text && !text.startsWith('http') ? `${text} (${href})` : text || href; });
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '');
  s = s.replace(/<blockquote[^>]*>/gi, '\n> ').replace(/<\/blockquote>/gi, '\n');
  s = s.replace(/<(?:td|th)[^>]*>/gi, ' | ').replace(/<\/tr>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|section|tr|table|ul|ol|pre|figure|h[1-6])>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n));
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

const wordTarget = b => b?.minWords && b?.maxWords ? `${b.minWords}–${b.maxWords} words` : b?.maxWords ? `up to ${b.maxWords} words` : 'not set';
export function postVars({post = {}, blog = {}, module = {}, categoryName = ''}) {
  return {brief: htmlToText(blog.brief || '') || 'No brief has been written for this blog.', blogTitle: blog.title || '', module: [module.code, module.title].filter(Boolean).join(' '), academicYear: post.academicYear || module.academicYear || '', wordTarget: wordTarget(blog),
    title: post.title || '', subtitle: post.excerpt || '', organisation: post.organisation || 'not stated', category: categoryName || post.category || 'not stated', tags: (post.tags || []).join(', ') || 'none', words: post.wordCount ?? '', penName: post.authorName || ''};
}

// The messages for one review. The JSON format rule is fixed by the code so an
// edited instruction text cannot break the parsing of the reply.
export function buildReview({grader = DEFAULT_GRADER, post, blog, module, categoryName = ''}) {
  const vars = postVars({post, blog, module, categoryName}), text = htmlToText(post.body || '');
  if (text.length < 200) throw Error('This post is too short to review (under 200 characters of text).');
  return {system: fill(grader.persona || DEFAULT_GRADER.persona, vars), user: `${fill(grader.instructions || DEFAULT_GRADER.instructions, vars)}\n\n${FORMAT_RULE}\n\nBlog post:\n"""\n${text}\n"""`, schema: REVIEW_SCHEMA, text};
}
export function buildPolish({grader = DEFAULT_GRADER, draft, post, blog, module, categoryName = ''}) {
  const vars = postVars({post, blog, module, categoryName});
  if (!draft || draft.trim().length < 20) throw Error('Write at least a sentence of feedback to polish.');
  return {system: fill(grader.persona || DEFAULT_GRADER.persona, vars), user: `${fill(grader.polish || DEFAULT_GRADER.polish, vars)}\n\nThe post is titled "${vars.title}" (${vars.organisation}; ${vars.category}).\n\nHere is my original feedback:\n"""\n${draft.trim()}\n"""`};
}

// Replies are JSON, sometimes wrapped in prose or a code fence. Anything else
// becomes feedback text without a grade rather than an error.
export function parseReview(text = '') {
  const raw = String(text).trim();
  const candidates = [raw, raw.replace(/^```(?:json)?\s*|\s*```$/g, ''), raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    if (!c || c[0] !== '{') continue;
    try { const o = JSON.parse(c); return {grade: clampGrade(o.grade), summary: String(o.summary || '').trim(), feedback: String(o.feedback || '').trim(), raw}; } catch {}
  }
  const m = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*10\b/);
  return {grade: m ? clampGrade(m[1]) : null, summary: '', feedback: raw, raw};
}
export function clampGrade(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
}

// One row per post for the table and the Excel sheet: the student's details,
// the post, the AI review and the instructor's final grade and feedback.
export function gradingRows({posts = [], users = [], reviews = [], modules = [], blogs = [], categoryName = () => '', postUrl = () => '', wordsOf = p => p.wordCount ?? 0}) {
  const who = new Map(users.map(u => [u.uid, u])), byPost = new Map(reviews.map(r => [r.postId, r]));
  const mod = id => modules.find(m => m.id === id), blog = id => blogs.find(b => b.id === id);
  return posts.map(p => {
    const u = who.get(p.authorId) || {}, r = byPost.get(p.id) || null, m = mod(p.moduleId), b = blog(p.blogId);
    return {postId: p.id, authorId: p.authorId, studentId: u.studentId || '', firstName: u.firstName || '', lastName: u.lastName || '', email: u.contactEmail || u.email || '', penName: p.authorName || u.penName || '',
      moduleTitle: m ? [m.code, m.title].filter(Boolean).join(' ') : p.moduleId, academicYear: p.academicYear || '', blogTitle: b?.title || '', title: p.title || '', url: p.status === 'published' ? postUrl(p) : '', status: p.status, words: wordsOf(p), organisation: p.organisation || '', category: categoryName(p),
      aiGrade: r?.grade ?? null, aiSummary: r?.summary || '', aiFeedback: r?.feedback || '', aiModel: r ? [r.provider, r.model, r.effort].filter(Boolean).join(' · ') : '', aiReviewedAt: r?.reviewedAt || null, aiError: r?.error || '',
      finalGrade: r?.finalGrade ?? '', finalFeedback: r?.finalFeedback || '', finalEditedAt: r?.finalEditedAt || null, review: r, post: p};
  }).sort((a, b) => (a.lastName + a.firstName + a.penName).localeCompare(b.lastName + b.firstName + b.penName));
}

export const GRADING_COLUMNS = [['Student ID', 'studentId', 16], ['First name', 'firstName', 18], ['Last name', 'lastName', 20], ['University email', 'email', 32], ['Pen name', 'penName', 18], ['Module', 'moduleTitle', 30], ['Academic year', 'academicYear', 14], ['Blog', 'blogTitle', 22], ['Post title', 'title', 40], ['Blog URL', 'url', 50], ['Status', 'status', 12], ['Words', 'words', 10], ['Organisation', 'organisation', 24], ['Category', 'category', 24],
  ['AI grade', 'aiGrade', 10], ['AI summary', 'aiSummary', 50], ['AI feedback', 'aiFeedback', 80], ['AI model', 'aiModel', 30], ['AI reviewed (UTC)', 'aiReviewed', 22], ['Manual FINAL feedback', 'finalFeedback', 80], ['Blog grade', 'finalGrade', 12], ['Post ID', 'postId', 38]];
