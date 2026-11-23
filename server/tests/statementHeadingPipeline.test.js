import test from 'node:test';
import assert from 'node:assert/strict';
import { statementFixture } from './fixtures/statementHeading.js';
import { requisiteDocument } from './fixtures/requisiteDocument.js';
import { isLocalStatementHeadingOrderEnabled, isStatementHeadingOrderEnabled, applyLocalStatementHeadingOrder } from '../services/statementHeadingPreviewService.js';

globalThis.__myworldEnvLoaded = true;
Object.assign(process.env, { DATABASE_URL: 'postgres://synthetic@localhost/synthetic', NODE_ENV: 'test',
  LOCAL_STATEMENT_HEADING_ORDER_ENABLED: 'true', LOCAL_REQUISITE_LAYOUT_ENABLED: 'true',
  TIMEWEB_AI_ENABLED: 'true', TIMEWEB_API_KEY: 'synthetic-only', TIMEWEB_MODEL: 'synthetic-model',
  TIMEWEB_BASE_URL: 'http://127.0.0.1:9/v1' });
const { enrichWithPipeline } = await import('../services/processingPipelineService.js');
const pipeline = { pipeline: 'standard', ocrProvider: 'google', aiProvider: 'timeweb' };

test('heading switch is local-only; production, a remote DB and an absent flag cannot enable it', () => {
  const env = { LOCAL_STATEMENT_HEADING_ORDER_ENABLED: 'true', NODE_ENV: 'test', DATABASE_URL: 'postgres://test@localhost/test' };
  assert.equal(isLocalStatementHeadingOrderEnabled(env), true);
  for (const change of [{ LOCAL_STATEMENT_HEADING_ORDER_ENABLED: 'false' }, { LOCAL_STATEMENT_HEADING_ORDER_ENABLED: undefined },
    { NODE_ENV: 'production' }, { DATABASE_URL: 'postgres://test@remote.example/test' }, { DATABASE_URL: '' }]) {
    assert.equal(isLocalStatementHeadingOrderEnabled({ ...env, ...change }), false);
  }
});

test('local integration rejects unverified sources, wrong modes, bank results and failures unchanged', () => {
  const input = statementFixture();
  const result = { formattedContent: input.content, cleanText: 'original' };
  const options = { pipeline, sourceVerified: true };
  assert.notEqual(applyLocalStatementHeadingOrder(input.sourceText, result, input.layout, options), result);
  for (const opts of [{ sourceVerified: false }, { pipeline: { ...pipeline, ocrProvider: 'yandex' } },
    { pipeline: { ...pipeline, pipeline: 'fast' } }, { env: { ...process.env, NODE_ENV: 'production' } },
    { env: { ...process.env, DATABASE_URL: 'postgres://test@remote.example/test' } }]) {
    assert.equal(applyLocalStatementHeadingOrder(input.sourceText, result, input.layout, { ...options, ...opts }), result);
  }
  const bank = { ...result, formattedContent: { ...input.content, requisiteLayout: { version: 1 } } };
  assert.equal(applyLocalStatementHeadingOrder(input.sourceText, bank, input.layout, options), bank);
  const failure = { error: 'TIMEWEB_TIMEOUT' };
  assert.equal(applyLocalStatementHeadingOrder(input.sourceText, failure, input.layout, options), failure);
  const malformed = structuredClone(input.layout); malformed.textAnnotations[2].boundingPoly.vertices[1] = null;
  assert.equal(applyLocalStatementHeadingOrder(input.sourceText, result, malformed, options), result);
});

test('production uses a separate explicit switch; false overrides local enablement', () => {
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgres://test@remote.example/test', LOCAL_STATEMENT_HEADING_ORDER_ENABLED: 'true' };
  assert.equal(isStatementHeadingOrderEnabled(env), false);
  assert.equal(isStatementHeadingOrderEnabled({ ...env, STATEMENT_HEADING_ORDER_ENABLED: 'true' }), true);
  assert.equal(isStatementHeadingOrderEnabled({ ...env, STATEMENT_HEADING_ORDER_ENABLED: 'false' }), false);
  assert.equal(isStatementHeadingOrderEnabled({ ...process.env, STATEMENT_HEADING_ORDER_ENABLED: 'false' }), false);
  const input = statementFixture(), result = { formattedContent: input.content };
  const options = { pipeline, sourceVerified: true, env: { ...env, STATEMENT_HEADING_ORDER_ENABLED: 'true' } };
  assert.equal(applyLocalStatementHeadingOrder(input.sourceText, result, input.layout, options).formattedContent.blocks[4].text, 'Заявление');
});

test('ordinary upload/retry pipeline reorders once for each audience, preserving OCR and call count', async () => {
  const input = statementFixture(), originalFetch = globalThis.fetch;
  let calls = 0, metrics = 0, status = 200;
  const payload = { title: 'Учебное заявление', summary: '', category: 'документ', section: 'документы', topic: '', tags: [],
    formattedContent: input.content, hasTable: false, hasFormulas: false,
    hasRecognitionErrors: false, textQuality: 'full_text', corrections: [], notes: '' };
  globalThis.fetch = async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.ok(request.messages[1].content.endsWith(currentText));
    return new Response(JSON.stringify(status === 200
      ? { choices: [{ message: { content: JSON.stringify(payload) }, finish_reason: 'stop' }] }
      : { error: { message: 'synthetic request failure' } }), { status, headers: { 'Content-Type': 'application/json' } });
  };
  let currentText = input.sourceText;
  const options = { layout: input.layout, layoutVerified: true, persistMetrics: async () => { metrics++; } };
  try {
    for (const audience of ['guest', 'free', 'paid']) for (const trigger of ['upload', 'retry']) {
      const before = calls;
      const result = await enrichWithPipeline(input.sourceText, { ...pipeline, audience }, { ...options, trigger });
      assert.equal(calls, before + 1);
      assert.equal(result.sourceText, input.sourceText);
      assert.equal(result.formattedContent.blocks[4].text, 'Заявление');
      assert.ok(result.cleanText.indexOf('Телефон 00123456789') < result.cleanText.indexOf('Заявление'));
    }
    const unverified = await enrichWithPipeline(input.sourceText, pipeline, { ...options, layoutVerified: false });
    assert.equal(unverified.formattedContent.blocks[0].text, 'Заявление');
    process.env.LOCAL_STATEMENT_HEADING_ORDER_ENABLED = 'false';
    const disabled = await enrichWithPipeline(input.sourceText, pipeline, options);
    assert.equal(disabled.formattedContent.blocks[0].text, 'Заявление');
    process.env.LOCAL_STATEMENT_HEADING_ORDER_ENABLED = 'true';
    const bank = requisiteDocument(); currentText = bank.text;
    const bankResult = await enrichWithPipeline(bank.text, pipeline, { ...options, layout: bank });
    assert.equal(bankResult.formattedContent.requisiteLayout.source, 'google_coordinates');
    assert.match(bankResult.cleanText, /044525225/u);
    currentText = input.sourceText;
    const previousMode = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production'; process.env.STATEMENT_HEADING_ORDER_ENABLED = 'true';
      const production = await enrichWithPipeline(input.sourceText, pipeline, options);
      assert.equal(production.formattedContent.blocks[4].text, 'Заявление');
      process.env.STATEMENT_HEADING_ORDER_ENABLED = 'false';
      const disabledProduction = await enrichWithPipeline(input.sourceText, pipeline, options);
      assert.equal(disabledProduction.formattedContent.blocks[0].text, 'Заявление');
    } finally { process.env.NODE_ENV = previousMode; delete process.env.STATEMENT_HEADING_ORDER_ENABLED; }
    status = 400;
    const failed = await enrichWithPipeline(input.sourceText, pipeline, options);
    assert.ok(failed.error); assert.deepEqual(failed.formattedContent, { blocks: [] });
    assert.equal(calls, 12); assert.equal(metrics, calls);
  } finally { globalThis.fetch = originalFetch; process.env.LOCAL_STATEMENT_HEADING_ORDER_ENABLED = 'true'; }
});
