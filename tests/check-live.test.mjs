import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { checkReferences, extractUrls, readRpc } from '../scripts/check-live.mjs';

const tools = [{ name: 'request_upload', inputSchema: { properties: { action: { enum: ['prepare', 'url', 'complete'] } } } }, { name: 'submit_request', inputSchema: {} }];

test('manifest longDescription checks every named upload action', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'));
  const text = manifest.extensions['com.openai'].interface.longDescription;
  const path = '/extensions/com.openai/interface/longDescription';
  assert.deepEqual(checkReferences('plugin.json', [{ text, path }], tools).errors, []);
  for (const action of ['prepare', 'url', 'complete']) {
    const changed = text.replace(`action:"${action}"`, 'action:"vanish"');
    assert.match(checkReferences('plugin.json', [{ text: changed, path }], tools).errors[0], /plugin.json\/extensions\/com.openai\/interface\/longDescription: tool "request_upload" has unsupported action "vanish"/);
  }
});

test('references cover backticks, bare prose, call forms and manifest tool declarations without field names', () => {
  const result = checkReferences('README.md', [{ text: '`request_upload` with action:"prepare", then action:"url". Call submit_request. `next_cursor` and `idempotency_key` are fields. request_upload {action:"complete"}' }], tools);
  assert.deepEqual(result.errors, []);
  assert.deepEqual([...result.references].sort(), ['request_upload', 'submit_request']);
  assert.deepEqual(checkReferences('empty.md', [{ text: 'No tools here.' }], tools).errors, []);
  assert.match(checkReferences('plugin.json', [{ text: 'imaginary_tool', path: '/tools_triggered' }], tools).errors[0], /plugin.json\/tools_triggered: missing MCP tool "imaginary_tool"/);
});

test('missing tools and actions report their file and owner', () => {
  const result = checkReferences('skills/example/SKILL.md', [{ text: '`imaginary_tool` then `request_upload` with action:"vanish"' }], tools);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /skills\/example\/SKILL.md: missing MCP tool "imaginary_tool"/);
  assert.match(result.errors[1], /request_upload.*unsupported action "vanish"/);
  assert.match(checkReferences('README.md', [{ text: 'request_upload {"action":"vanish"}' }], tools).errors[0], /request_upload.*unsupported action "vanish"/);
  assert.match(checkReferences('README.md', [{ text: 'mystery_tool {action:"x"}' }], tools).errors[0], /missing MCP tool "mystery_tool"/);
  assert.match(checkReferences('README.md', [{ text: 'action:"x"' }], tools).errors[0], /no preceding tool/);
});

test('every manifest-declared tool is checked, even without underscores or in the field exclusion list', () => {
  const path = '/extensions/com.openai/review/test_cases/positive/0/tools_triggered';
  assert.deepEqual(checkReferences('plugin.json', [{ text: 'request_upload, submit_request', path }], tools).errors, []);
  for (const name of ['getcompany', 'fake-tool', 'next_cursor']) assert.match(checkReferences('plugin.json', [{ text: name, path }], tools).errors[0], new RegExp(`missing MCP tool "${name}"`));
  assert.match(checkReferences('plugin.json', [{ text: 'getcompany', path: `${path}/0` }], tools).errors[0], /missing MCP tool "getcompany"/);
  assert.deepEqual(checkReferences('plugin.json', [{ text: 'echo', path }], [{ name: 'echo' }]).errors, []);
  assert.match(checkReferences('plugin.json', [{ text: '', path }], tools).errors[0], /empty MCP tool declaration/);
});

test('site URLs exclude punctuation, other origins and JSON escapes', () => {
  assert.deepEqual([...extractUrls([{ text: '(https://physicalvalidation.com/docs/mcp). https://physicalvalidation.com/privacy, https://physicalvalidation.com "https://physicalvalidation.com/terms" https://physicalvalidation.com.evil.test/no' }])], [
    'https://physicalvalidation.com/docs/mcp', 'https://physicalvalidation.com/privacy', 'https://physicalvalidation.com', 'https://physicalvalidation.com/terms',
  ]);
  assert.deepEqual([...extractUrls([{ text: 'https://physicalvalidation.com.evil.test/no' }])], []);
});

test('RPC reads JSON, rejects incorrect IDs and retains error responses', async () => {
  assert.deepEqual(await readRpc(Response.json({ id: 1, result: {} }), 1), { id: 1, result: {} });
  assert.deepEqual(await readRpc(Response.json({ id: 1, error: { code: -1 } }), 1), { id: 1, error: { code: -1 } });
  await assert.rejects(readRpc(Response.json({ id: 2 }), 1), /missing RPC id 1/);
  await assert.rejects(readRpc(new Response(''), 1), /neither JSON nor SSE/);
});

test('SSE reads chunked multiline events, ignores notifications and cancels an open stream', async () => {
  const encoder = new TextEncoder();
  let cancelled = false;
  const chunks = [': heartbeat\r\n\r\ndata: {"method":"ping"}\n\n', 'event: message\ndata: {"id":1,\ndata: "result":{"tools":[]}}\n', '\n'];
  const body = new ReadableStream({
    pull(controller) { if (chunks.length) controller.enqueue(encoder.encode(chunks.shift())); },
    cancel() { cancelled = true; },
  });
  assert.deepEqual(await readRpc(new Response(body, { headers: { 'content-type': 'text/event-stream' } }), 1), { id: 1, result: { tools: [] } });
  assert.equal(cancelled, true);
  await assert.rejects(readRpc(new Response('data: {"id":2}\n\n', { headers: { 'content-type': 'text/event-stream' } }), 1), /without RPC id 1/);
  await assert.rejects(readRpc(new Response('data: broken\n\n', { headers: { 'content-type': 'text/event-stream' } }), 1), SyntaxError);
});
