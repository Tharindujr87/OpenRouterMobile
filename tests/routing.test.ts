import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO,
  DEFAULT_ROUTING,
  FREE_ROUTING,
  modelMetaKey,
  routeTask,
} from '../src/lib/routing.ts';

test('capture commands stay local and free', () => {
  const result = routeTask('remind me tomorrow at 9 to call supplier', AUTO, DEFAULT_ROUTING);
  assert.equal(result.useLocalParser, true);
  assert.equal(result.category, 'capture');
});

test('image work routes to the image model', () => {
  const result = routeTask('draw a logo for my brand', AUTO, DEFAULT_ROUTING);
  assert.equal(result.category, 'image');
  assert.equal(result.modelId, DEFAULT_ROUTING.imageModel);
  assert.equal(result.useLocalParser, false);
});

test('document work routes to the document model', () => {
  const result = routeTask('turn this into a pdf report', AUTO, DEFAULT_ROUTING);
  assert.equal(result.category, 'document');
  assert.equal(result.modelId, DEFAULT_ROUTING.documentModel);
});

test('complex reasoning routes to the strong model', () => {
  const result = routeTask('analyze the trade-offs between these two options', AUTO, DEFAULT_ROUTING);
  assert.equal(result.category, 'reasoning');
  assert.equal(result.modelId, DEFAULT_ROUTING.strongModel);
});

test('ordinary chat uses the cheap default', () => {
  const result = routeTask('what should I have for lunch', AUTO, DEFAULT_ROUTING);
  assert.equal(result.category, 'auto');
  assert.equal(result.modelId, DEFAULT_ROUTING.autoModel);
});

test('video without a configured model is reported as unavailable', () => {
  const result = routeTask('make a short video clip', AUTO, DEFAULT_ROUTING);
  assert.equal(result.category, 'video');
  assert.equal(result.unavailable, true);
  assert.equal(result.modelId, '');
});

test('configured video model is used for video requests', () => {
  const result = routeTask('make a short video clip', AUTO, {
    ...DEFAULT_ROUTING,
    videoModel: 'example/video-model',
  });
  assert.equal(result.category, 'video');
  assert.equal(result.unavailable, false);
  assert.equal(result.modelId, 'example/video-model');
});

test('free mode uses the free router for ordinary chat', () => {
  const result = routeTask('what should I have for lunch', AUTO, FREE_ROUTING);
  assert.equal(result.category, 'auto');
  assert.equal(result.modelId, 'openrouter/free');
});

test('free mode escalates to the strongest free model', () => {
  const result = routeTask('analyze these trade-offs', AUTO, FREE_ROUTING);
  assert.equal(result.category, 'reasoning');
  assert.equal(result.modelId, FREE_ROUTING.strongModel);
});

test('free mode reports that image work has no free model', () => {
  const result = routeTask('draw a picture', AUTO, FREE_ROUTING);
  assert.equal(result.category, 'image');
  assert.equal(result.unavailable, true);
  assert.match(result.reason, /no free image model/i);
});

test('model settings are stored per mode', () => {
  assert.equal(modelMetaKey('free', 'autoModel'), 'free.autoModel');
  assert.equal(modelMetaKey('pro', 'autoModel'), 'pro.autoModel');
});

test('manual selection always wins over auto routing', () => {
  const result = routeTask('draw a logo', 'openai/gpt-6.2-astra', DEFAULT_ROUTING);
  assert.equal(result.category, 'manual');
  assert.equal(result.modelId, 'openai/gpt-6.2-astra');
});
