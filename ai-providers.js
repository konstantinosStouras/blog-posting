// Grading keys last only for the current admin page session.
export const gradingKeys = {};
try { globalThis.localStorage?.removeItem('ucd-blog.aiKeys'); } catch {}
// AI providers for the admin-only grading assistant. Pure request building and
// response parsing so the shapes can be unit-tested without the network; the
// browser calls each lab's API directly with the admin's own key (bring your own
// key), so no server and no shared secret are involved. Keys never leave the
// admin's browser except in the request to the lab that issued them.
//
// Every provider exposes the same surface:
//   models   the lab's top models for this task (the admin may also type any id)
//   efforts  the reasoning-effort choices the API accepts
//   request({apiKey, model, effort, system, user, maxTokens, schema}) → {url, headers, body}
//   parse(json) → {text, usage:{input, output}, stop}
// `schema` is a JSON schema the reply must follow (grade + feedback); providers
// that support structured output enforce it, the others are asked in the prompt.

const JSON_HEADERS = {'content-type': 'application/json'};

export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    keyHint: 'sk-ant-…',
    console: 'https://console.anthropic.com/settings/keys',
    models: [
      {id: 'claude-fable-5-1', name: 'Claude Fable 5.1'},
      {id: 'claude-opus-5-5', name: 'Claude Opus 5.5'},
      {id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5'},
      {id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5'},
    ],
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    request({apiKey, model, effort, system, user, maxTokens = 16000, schema = null, fallbacks = true}) {
      const headers = {...JSON_HEADERS, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'};
      const body = {model, max_tokens: maxTokens, system, messages: [{role: 'user', content: user}], output_config: {effort}};
      if (schema) body.output_config.format = {type: 'json_schema', schema};
      // Thinking is adaptive by default on current models; it is deliberately not set.
      if (fallbacks) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
      return {url: 'https://api.anthropic.com/v1/messages', headers, body};
    },
    parse(json) {
      if (json.stop_reason === 'refusal') throw Error('The model declined this request' + (json.stop_details?.explanation ? ': ' + json.stop_details.explanation : '.'));
      const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return {text, usage: {input: json.usage?.input_tokens ?? null, output: json.usage?.output_tokens ?? null}, stop: json.stop_reason || '', model: json.model || ''};
    },
    error(json) { return json?.error?.message || ''; },
  },
  openai: {
    name: 'OpenAI',
    keyHint: 'sk-…',
    console: 'https://platform.openai.com/api-keys',
    models: [
      {id: 'gpt-5.6', name: 'GPT-5.6'},
      {id: 'gpt-5.5', name: 'GPT-5.5'},
      {id: 'gpt-5.4-mini', name: 'GPT-5.4 mini'},
    ],
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    request({apiKey, model, effort, system, user, maxTokens = 16000, schema = null}) {
      const body = {model, instructions: system, input: user, reasoning: {effort}, max_output_tokens: maxTokens};
      if (schema) body.text = {format: {type: 'json_schema', name: 'blog_review', schema, strict: true}};
      return {url: 'https://api.openai.com/v1/responses', headers: {...JSON_HEADERS, authorization: 'Bearer ' + apiKey}, body};
    },
    parse(json) {
      const text = (json.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n').trim();
      if (!text && json.incomplete_details?.reason) throw Error('The reply was cut short: ' + json.incomplete_details.reason);
      return {text, usage: {input: json.usage?.input_tokens ?? null, output: json.usage?.output_tokens ?? null}, stop: json.status || '', model: json.model || ''};
    },
    error(json) { return json?.error?.message || ''; },
  },
  google: {
    name: 'Google',
    keyHint: 'AIza…',
    console: 'https://aistudio.google.com/apikey',
    models: [
      {id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro'},
      {id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash'},
    ],
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    request({apiKey, model, effort, system, user, maxTokens = 16000, schema = null}) {
      const generationConfig = {maxOutputTokens: maxTokens, thinkingConfig: {thinkingLevel: effort}};
      if (schema) { generationConfig.responseMimeType = 'application/json'; generationConfig.responseSchema = googleSchema(schema); }
      return {url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers: {...JSON_HEADERS, 'x-goog-api-key': apiKey},
        body: {systemInstruction: {parts: [{text: system}]}, contents: [{role: 'user', parts: [{text: user}]}], generationConfig}};
    },
    parse(json) {
      const c = (json.candidates || [])[0];
      if (!c) throw Error(json.promptFeedback?.blockReason ? 'The request was blocked: ' + json.promptFeedback.blockReason : 'The model returned no answer.');
      const text = (c.content?.parts || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('\n').trim();
      return {text, usage: {input: json.usageMetadata?.promptTokenCount ?? null, output: json.usageMetadata?.candidatesTokenCount ?? null}, stop: c.finishReason || '', model: json.modelVersion || ''};
    },
    error(json) { return json?.error?.message || ''; },
  },
  xai: {
    name: 'xAI',
    keyHint: 'xai-…',
    console: 'https://console.x.ai/',
    models: [
      {id: 'grok-4.7', name: 'Grok 4.7'},
      {id: 'grok-4.6', name: 'Grok 4.6'},
      {id: 'grok-4.5', name: 'Grok 4.5'},
    ],
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    request({apiKey, model, effort, system, user, maxTokens = 16000, schema = null}) {
      const body = {model, messages: [{role: 'system', content: system}, {role: 'user', content: user}], max_tokens: maxTokens};
      if (effort) body.reasoning_effort = effort;   // not every Grok model accepts it; callProvider retries once without it on a 400
      if (schema) body.response_format = {type: 'json_schema', json_schema: {name: 'blog_review', schema, strict: true}};
      return {url: 'https://api.x.ai/v1/chat/completions', headers: {...JSON_HEADERS, authorization: 'Bearer ' + apiKey}, body};
    },
    parse(json) {
      const text = String(json.choices?.[0]?.message?.content || '').trim();
      return {text, usage: {input: json.usage?.prompt_tokens ?? null, output: json.usage?.completion_tokens ?? null}, stop: json.choices?.[0]?.finish_reason || '', model: json.model || ''};
    },
    error(json) { return json?.error?.message || json?.error || ''; },
  },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS);

// Gemini's responseSchema is an OpenAPI subset: no additionalProperties, no $schema.
function googleSchema(schema) {
  if (Array.isArray(schema)) return schema.map(googleSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) if (!['additionalProperties', '$schema'].includes(k)) out[k] = googleSchema(v);
  return out;
}

// Sends one request. `fetchFn` is injectable for tests. A 400 that rejects the
// optional fallback fields (older gateways, or if the beta is withdrawn) is
// retried once without them.
export async function callProvider(providerId, options, fetchFn = globalThis.fetch) {
  const p = PROVIDERS[providerId];
  if (!p) throw Error('Unknown AI provider.');
  if (!options.apiKey) throw Error(`Add your ${p.name} API key first.`);
  const attempt = async opts => {
    const {url, headers, body} = p.request(opts);
    const res = await fetchFn(url, {method: 'POST', headers, body: JSON.stringify(body)});
    let json = null; try { json = await res.json(); } catch {}
    return {res, json};
  };
  let {res, json} = await attempt(options);
  if (res.status === 400 && providerId === 'anthropic' && options.fallbacks !== false) ({res, json} = await attempt({...options, fallbacks: false}));
  if (res.status === 400 && providerId === 'xai' && options.effort) ({res, json} = await attempt({...options, effort: ''}));
  if (!res.ok) throw Error(`${p.name} replied ${res.status}${p.error(json) ? ': ' + p.error(json) : ''}`);
  return p.parse(json);
}
