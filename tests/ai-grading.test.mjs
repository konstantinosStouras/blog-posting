import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {PROVIDERS, PROVIDER_IDS, callProvider} from '../ai-providers.js';
import {createSheetWorkbook} from '../roster-export.js';
import {DEFAULT_GRADER, REVIEW_SCHEMA, htmlToText, buildReview, buildPolish, parseReview, clampGrade, gradingRows, fill, GRADING_COLUMNS} from '../ai-grading-model.js';

const post = {id: 'p1', title: 'Ryanair and sustainability', excerpt: 'Flying greener', organisation: 'Ryanair', category: 'sustainability', tags: ['ESG'], wordCount: 950, academicYear: '2026/27', authorId: 'u1', authorName: 'idkmc', status: 'published', moduleId: 'm1', blogId: 'b1',
  body: '<h2>Why it matters</h2><p>Ryanair faces <a href="https://example.com/report">pressure from regulators</a> &amp; investors.</p><ul><li>Fleet renewal</li><li>SAF</li></ul><figure><img alt="Emissions chart"><figcaption>Figure 1</figcaption></figure>' + '<p>' + 'More analysis follows here. '.repeat(20) + '</p>'};
const blog = {id: 'b1', title: 'Project Management', brief: '<p>Analyse <b>one organisation</b>.</p>', minWords: 900, maxWords: 1100};
const module = {id: 'm1', code: 'BMGT45540', title: 'Managing Innovative Projects', academicYear: '2026/27'};

test('post HTML becomes text that keeps headings, links, lists and captions', () => {
  const t = htmlToText(post.body);
  assert.match(t, /^## Why it matters\n\nRyanair faces pressure from regulators \(https:\/\/example.com\/report\) & investors\./);
  assert.match(t, /- Fleet renewal\n- SAF/);
  assert.match(t, /\[Image: Emissions chart\]\n\nCaption: Figure 1/);
  assert.equal(htmlToText('<script>x()</script><p>a&nbsp;b</p>'), 'a b');
});

test('review messages fill the persona and instructions with the blog, module and post', () => {
  const r = buildReview({post, blog, module, categoryName: 'Sustainability and climate change'});
  assert.match(r.system, /MSc-level module \(BMGT45540 Managing Innovative Projects, 2026\/27\)/);
  assert.match(r.system, /"Project Management" blog/);
  assert.match(r.user, /Analyse one organisation\./);
  assert.match(r.user, /Word target: 900–1100 words/);
  assert.match(r.user, /organisation studied: Ryanair; category: Sustainability and climate change; tags: ESG; length: 950 words/);
  assert.match(r.user, /Reply with a single JSON object/);
  assert.match(r.user, /Blog post:\n"""\n## Why it matters/);
  assert.equal(r.schema, REVIEW_SCHEMA);
  assert.throws(() => buildReview({post: {...post, body: '<p>Short.</p>'}, blog, module}), /too short/);
  const custom = buildReview({grader: {...DEFAULT_GRADER, persona: 'Grade {blogTitle} for {module}'}, post, blog, module});
  assert.equal(custom.system, 'Grade Project Management for BMGT45540 Managing Innovative Projects');
  assert.equal(fill('{unknown} stays', {}), '{unknown} stays');
});

test('polish messages wrap the instructor draft', () => {
  const p = buildPolish({draft: 'Good post, but the recommendations section is thin.', post, blog, module});
  assert.match(p.user, /Here is my original feedback:\n"""\nGood post, but the recommendations section is thin\.\n"""/);
  assert.throws(() => buildPolish({draft: 'ok', post, blog, module}), /at least a sentence/);
});

test('replies are parsed from JSON, fenced JSON, prose with JSON, or plain text', () => {
  assert.deepEqual(parseReview('{"grade": 7.25, "summary": "S", "feedback": "F"}'), {grade: 7.3, summary: 'S', feedback: 'F', raw: '{"grade": 7.25, "summary": "S", "feedback": "F"}'});
  assert.equal(parseReview('```json\n{"grade": "8", "summary": "S", "feedback": "F"}\n```').grade, 8);
  assert.equal(parseReview('Here you go: {"grade": 12, "summary": "S", "feedback": "F"} thanks').grade, 10);
  const plain = parseReview('Your post is strong. I would give it 6/10.');
  assert.equal(plain.grade, 6); assert.equal(plain.feedback, 'Your post is strong. I would give it 6/10.');
  assert.equal(parseReview('No number here').grade, null);
  assert.equal(clampGrade('abc'), null); assert.equal(clampGrade(-3), 0);
});

test('every provider builds a request with the key, model, effort, prompts and schema', () => {
  for (const id of PROVIDER_IDS) {
    const p = PROVIDERS[id], model = p.models[0].id;
    const {url, headers, body} = p.request({apiKey: 'KEY', model, effort: p.efforts[0], system: 'SYS', user: 'USR', schema: REVIEW_SCHEMA});
    assert.match(url, /^https:\/\//);
    const text = JSON.stringify({url, headers, body});
    assert.match(text, /KEY/); assert.match(text, new RegExp(model.replace('.', '\\.'))); assert.match(text, /SYS/); assert.match(text, /USR/); assert.match(text, /feedback/);
    assert.ok(p.efforts.includes(p.defaultEffort));
  }
  const a = PROVIDERS.anthropic.request({apiKey: 'k', model: 'claude-fable-5-1', effort: 'high', system: 's', user: 'u', schema: REVIEW_SCHEMA});
  assert.equal(a.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(a.body.output_config.effort, 'high'); assert.equal(a.body.fallbacks, 'default'); assert.equal(a.body.thinking, undefined);
  assert.equal(a.body.output_config.format.type, 'json_schema');
  const o = PROVIDERS.openai.request({apiKey: 'k', model: 'gpt-5.6', effort: 'xhigh', system: 's', user: 'u', schema: REVIEW_SCHEMA});
  assert.equal(o.body.reasoning.effort, 'xhigh'); assert.equal(o.body.text.format.strict, true);
  const g = PROVIDERS.google.request({apiKey: 'k', model: 'gemini-3.8-flash', effort: 'low', system: 's', user: 'u', schema: REVIEW_SCHEMA});
  assert.equal(g.body.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(g.body.generationConfig.responseSchema.additionalProperties, undefined);
  assert.equal(g.body.generationConfig.responseSchema.properties.grade.type, 'number');
});

test('every provider parses its reply shape and surfaces API errors', async () => {
  const replies = {
    anthropic: {content: [{type: 'thinking', thinking: ''}, {type: 'text', text: '{"grade":8,"summary":"s","feedback":"f"}'}], usage: {input_tokens: 10, output_tokens: 5}, stop_reason: 'end_turn', model: 'claude-fable-5-1'},
    openai: {output: [{type: 'reasoning'}, {type: 'message', content: [{type: 'output_text', text: '{"grade":8,"summary":"s","feedback":"f"}'}]}], usage: {input_tokens: 10, output_tokens: 5}, status: 'completed'},
    google: {candidates: [{content: {parts: [{text: 'thinking', thought: true}, {text: '{"grade":8,"summary":"s","feedback":"f"}'}]}, finishReason: 'STOP'}], usageMetadata: {promptTokenCount: 10, candidatesTokenCount: 5}},
    xai: {choices: [{message: {content: '{"grade":8,"summary":"s","feedback":"f"}'}, finish_reason: 'stop'}], usage: {prompt_tokens: 10, completion_tokens: 5}},
  };
  for (const id of PROVIDER_IDS) {
    const r = PROVIDERS[id].parse(replies[id]);
    assert.equal(parseReview(r.text).grade, 8, id); assert.deepEqual(r.usage, {input: 10, output: 5}, id);
  }
  assert.throws(() => PROVIDERS.anthropic.parse({stop_reason: 'refusal', stop_details: {explanation: 'policy'}, content: []}), /declined this request: policy/);
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({url, body: JSON.parse(init.body)}); return {ok: calls.length > 1, status: calls.length > 1 ? 200 : 400, json: async () => calls.length > 1 ? replies.anthropic : {error: {message: 'unknown beta'}}}; };
  const out = await callProvider('anthropic', {apiKey: 'k', model: 'claude-fable-5-1', effort: 'high', system: 's', user: 'u'}, fetchFn);
  assert.equal(calls.length, 2); assert.equal(calls[0].body.fallbacks, 'default'); assert.equal(calls[1].body.fallbacks, undefined); assert.equal(parseReview(out.text).grade, 8);
  await assert.rejects(callProvider('openai', {apiKey: 'k', model: 'gpt-5.6', effort: 'high', system: 's', user: 'u'}, async () => ({ok: false, status: 401, json: async () => ({error: {message: 'Incorrect API key'}})})), /OpenAI replied 401: Incorrect API key/);
  await assert.rejects(callProvider('openai', {model: 'gpt-5.6'}), /Add your OpenAI API key first/);
});

test('grading rows join students, posts and reviews and keep the sheet columns', () => {
  const rows = gradingRows({posts: [post, {...post, id: 'p2', authorId: 'u2', authorName: 'zed', status: 'draft', title: 'Draft'}], users: [{uid: 'u1', firstName: 'Aoife', lastName: 'Byrne', studentId: '26000001', contactEmail: 'aoife@ucdconnect.ie'}],
    reviews: [{postId: 'p1', grade: 7.5, summary: 'S', feedback: 'F', provider: 'anthropic', model: 'claude-fable-5-1', effort: 'high', reviewedAt: 1, finalGrade: 'A', finalFeedback: 'Well done'}], modules: [module], blogs: [blog], categoryName: () => 'Sustainability', postUrl: p => 'https://x/' + p.id});
  assert.equal(rows.length, 2);
  const r = rows.find(x => x.postId === 'p1');
  assert.equal(r.studentId, '26000001'); assert.equal(r.email, 'aoife@ucdconnect.ie'); assert.equal(r.aiGrade, 7.5); assert.equal(r.aiModel, 'anthropic · claude-fable-5-1 · high'); assert.equal(r.finalGrade, 'A'); assert.equal(r.url, 'https://x/p1'); assert.equal(r.moduleTitle, 'BMGT45540 Managing Innovative Projects');
  const d = rows.find(x => x.postId === 'p2');
  assert.equal(d.url, ''); assert.equal(d.aiGrade, null); assert.equal(d.firstName, '');
  assert.equal(gradingRows({posts: [post], wordsOf: () => 123})[0].words, 123);
});

test('the grading sheet keeps the old spreadsheet columns, bold headings and text IDs', async () => {
  const rows = gradingRows({posts: [post], users: [{uid: 'u1', studentId: '00123'}], reviews: [{postId: 'p1', grade: 7.5, feedback: 'F', finalGrade: 'A'}], modules: [module], blogs: [blog]});
  const book = createSheetWorkbook(ExcelJS, 'AI grading', GRADING_COLUMNS, rows.map(r => ({...r, aiReviewed: ''})));
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(await book.xlsx.writeBuffer());
  const ws = loaded.getWorksheet('AI grading'), headings = ws.getRow(1).values.slice(1);
  assert.deepEqual(headings.slice(0, 3), ['Student ID', 'First name', 'Last name']);
  assert.ok(headings.includes('AI feedback') && headings.includes('Manual FINAL feedback') && headings.includes('Blog grade'));
  assert.equal(ws.getCell('A1').font.bold, true); assert.equal(ws.getCell('A2').value, '00123'); assert.equal(ws.getCell('A2').numFmt, '@');
  assert.equal(ws.getRow(2).getCell(headings.indexOf('AI grade') + 1).value, '7.5');
});
