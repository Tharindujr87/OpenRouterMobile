import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BASE_URL, normalizeBaseUrl, verifyOpenRouterKey } from '../src/lib/ai.ts';

test('repairs a mistyped OpenRouter API version', () => {
  assert.equal(normalizeBaseUrl('https://openrouter.ai/api/v14'), 'https://openrouter.ai/api/v1');
});

test('accepts the bare OpenRouter host', () => {
  assert.equal(normalizeBaseUrl('https://openrouter.ai'), 'https://openrouter.ai/api/v1');
});

test('keeps custom proxy URLs unchanged', () => {
  assert.equal(normalizeBaseUrl('http://localhost:8787/v1'), 'http://localhost:8787/v1');
});

test('rejects malformed keys before sending any request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response());
  await assert.rejects(
    verifyOpenRouterKey({ baseUrl: DEFAULT_BASE_URL, apiKey: 'https://openrouter.ai/api/v1' }),
    /wrong format/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test('checks authentication without a model call and normalizes pasted Bearer tokens', async (t) => {
  const dummyKey = `sk-or-v1-${'0'.repeat(64)}`;
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: string, _options: RequestInit) => new Response());
  await verifyOpenRouterKey({ baseUrl: DEFAULT_BASE_URL, apiKey: ` Bearer ${dummyKey}\n` });
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, `${DEFAULT_BASE_URL}/key`);
  assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${dummyKey}`);
});
