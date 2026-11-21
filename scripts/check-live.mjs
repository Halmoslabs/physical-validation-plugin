import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = 'https://physicalvalidation.com/mcp';
const userAgent = 'physical-validation-plugin-contract-check/1.0';
const nonTools = new Set(['account_token', 'draft_id', 'idempotency_key', 'input_schema', 'next_cursor', 'request_id', 'tool_name']);
const snake = '[a-z][a-z0-9]*(?:_[a-z0-9]+)+';

export async function readRpc(response, id) {
  if (response.headers.get('content-type')?.includes('application/json')) {
    const message = await response.json();
    if (message.id !== id) throw new Error(`MCP response missing RPC id ${id}`);
    return message;
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('MCP response is neither JSON nor SSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replaceAll('\r\n', '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        if (message.id === id) return message;
      }
      if (done) throw new Error(`MCP stream ended without RPC id ${id}`);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

async function listTools() {
  let session, protocol, sequence = 0;
  const rpc = async (method, params, notification = false) => {
    const id = ++sequence;
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': userAgent };
    if (session) headers['mcp-session-id'] = session;
    if (protocol) headers['mcp-protocol-version'] = protocol;
    const response = await fetch(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(20_000), body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, ...(params ? { params } : {}) }) });
    session = response.headers.get('mcp-session-id') ?? session;
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`MCP ${method}: HTTP ${response.status}`);
    }
    if (notification) { await response.body?.cancel(); return; }
    const message = await readRpc(response, id);
    if (message.error) throw new Error(`MCP ${method}: ${JSON.stringify(message.error)}`);
    if (!message.result) throw new Error(`MCP ${method}: missing result`);
    return message.result;
  };
  const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'physical-validation-plugin-contract-check', version: '1.0' } });
  protocol = initialized.protocolVersion;
  if (!protocol) throw new Error('MCP initialize: missing negotiated protocolVersion');
  await rpc('notifications/initialized', undefined, true);
  const tools = [], cursors = new Set();
  let cursor;
  do {
    const page = await rpc('tools/list', cursor ? { cursor } : {});
    if (!Array.isArray(page.tools)) throw new Error('MCP tools/list: missing tools array');
    tools.push(...page.tools);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('MCP tools/list: repeated pagination cursor');
    cursors.add(cursor);
  } while (cursor);
  if (!tools.length) throw new Error('MCP tools/list: empty catalogue');
  console.log(`PASS MCP initialize, notifications/initialized, tools/list: ${tools.length} tools (${protocol})`);
  return tools;
}

function strings(value, path = '') {
  if (typeof value === 'string') return [{ text: value, path }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => strings(child, `${path}/${key}`));
}

function actionTool(text, index, names) {
  const before = text.slice(0, index);
  let owner;
  for (const match of before.matchAll(new RegExp('\\b(' + snake + ')`?\\s*\\{', 'g'))) {
    if (!names.has(match[1])) continue;
    let depth = 0, quote, escaped = false;
    for (const char of before.slice(match.index + match[0].indexOf('{'))) {
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = undefined;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) break;
    }
    if (depth > 0) owner = match[1];
  }
  if (owner) return owner;
  const expression = before.split(/(?<!\b(?:e\.g|i\.e))\.(?=\s)|[!?](?=\s)|\n\s*\n/).at(-1);
  const calls = [];
  for (const match of expression.matchAll(new RegExp('\\b(?:call|invoke|use|using)\\s+`?(' + snake + ')`?', 'gi'))) if (names.has(match[1])) calls.push({ index: match.index, name: match[1] });
  for (const match of expression.matchAll(new RegExp('`?(' + snake + ')`?\\s+with\\b', 'g'))) {
    if (names.has(match[1]) && !/\b(?:for|to|from|in|of|before|after)\s*$/.test(expression.slice(0, match.index))) calls.push({ index: match.index, name: match[1] });
  }
  return calls.sort((a, b) => b.index - a.index)[0]?.name;
}

export function checkReferences(file, sections, tools) {
  const catalogue = new Map(tools.map(tool => [tool.name, tool]));
  const errors = [], references = new Set();
  for (const { text, path = '' } of sections) {
    const found = new Map();
    const add = (name, index) => { if (!nonTools.has(name)) found.set(index, name); };
    for (const match of text.matchAll(new RegExp('`(' + snake + ')(?=`|\\s*\\{)', 'g'))) add(match[1], match.index);
    for (const match of text.matchAll(new RegExp('\\b(' + snake + ')\\s*\\{', 'g'))) add(match[1], match.index);
    for (const match of text.matchAll(/\b((?:search|get|list|prepare|submit|delete|request|save|update|create|read|find)_[a-z0-9_]+)\b/g)) add(match[1], match.index);
    if (/\/tools_triggered(?:\/\d+)?$/.test(path)) {
      let offset = 0;
      for (const entry of text.split(',')) {
        const name = entry.trim();
        if (name) found.set(offset + entry.indexOf(name), name);
        else errors.push(`${file}${path}: empty MCP tool declaration`);
        offset += entry.length + 1;
      }
    }
    const label = `${file}${path}`;
    for (const name of found.values()) {
      references.add(name);
      if (!catalogue.has(name)) errors.push(`${label}: missing MCP tool "${name}"`);
    }
    const names = new Set([...catalogue.keys(), ...found.values()]);
    for (const match of text.matchAll(/\baction["']?\s*:\s*["']([^"']+)["']/g)) {
      const current = actionTool(text, match.index, names);
      const actions = catalogue.get(current)?.inputSchema?.properties?.action?.enum;
      if (!current) errors.push(`${label}: action "${match[1]}" has no preceding tool call in the same expression`);
      else if (catalogue.has(current) && (!actions || !actions.includes(match[1]))) errors.push(`${label}: tool "${current}" has unsupported action "${match[1]}" (allowed: ${actions?.join(', ') || 'none'})`);
    }
  }
  return { errors: [...new Set(errors)], references };
}

export function extractUrls(sections) {
  const urls = new Set();
  for (const { text } of sections) for (const match of text.matchAll(/https:\/\/[^\s<>"'`)\]}]+/g)) {
    const url = match[0].replace(/[.,;:!?]+$/, '');
    if (new URL(url).origin === 'https://physicalvalidation.com') urls.add(url);
  }
  return urls;
}

async function checkUrl(url) {
  for (const method of ['HEAD', 'GET']) {
    const response = await fetch(url, { method, headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(15_000) });
    await response.body?.cancel();
    if (method === 'HEAD' && [404, 405, 501].includes(response.status)) continue;
    if (response.status === 404 || response.status >= 500 || response.status === 429) throw new Error(`HTTP ${response.status}`);
    return;
  }
}

export async function main() {
  const json = new Map();
  for (const file of ['plugin.json', 'mcp.json', '.mcp.json', '.claude-plugin/plugin.json']) {
    try { json.set(file, JSON.parse(await readFile(resolve(root, file), 'utf8'))); }
    catch (error) { throw new Error(`${file}: invalid JSON: ${error.message}`); }
  }
  const version = json.get('plugin.json').version;
  if (typeof version !== 'string' || !version || version !== json.get('.claude-plugin/plugin.json').version) throw new Error('plugin.json and .claude-plugin/plugin.json: versions must match and be nonempty strings');
  const documents = new Map();
  for (const entry of await readdir(resolve(root, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = `skills/${entry.name}/SKILL.md`;
    const text = await readFile(resolve(root, file), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
    if (!frontmatter || !/^name:[ \t]*\S[^\r\n]*$/m.test(frontmatter) || !/^description:[ \t]*\S[^\r\n]*$/m.test(frontmatter)) throw new Error(`${file}: invalid SKILL.md frontmatter (requires name and description)`);
    documents.set(file, [{ text }]);
  }
  if (!documents.size) throw new Error('skills/: no SKILL.md files');
  console.log(`PASS lint: 4 JSON files, ${documents.size} skills, matching plugin versions ${version}`);
  documents.set('README.md', [{ text: await readFile(resolve(root, 'README.md'), 'utf8') }]);
  documents.set('plugin.json', strings(json.get('plugin.json')));
  const tools = await listTools();
  const errors = [], references = new Set(), links = new Map();
  for (const [file, sections] of documents) {
    const checked = checkReferences(file, sections, tools);
    errors.push(...checked.errors);
    for (const name of checked.references) references.add(name);
    for (const url of extractUrls(sections)) links.set(url, [...links.get(url) ?? [], file]);
  }
  for (const [url, files] of links) {
    try { await checkUrl(url); }
    catch (error) { errors.push(`${files.join(', ')}: URL ${url}: ${error.message}`); }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`PASS references: ${references.size} tool names and all documented action values across ${documents.size} files`);
  console.log(`PASS URLs: ${links.size} live physicalvalidation.com links (HEAD/GET; none 404)`);
  console.log('PASS live plugin contract');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
}
