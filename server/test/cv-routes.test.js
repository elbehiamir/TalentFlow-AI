import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createCvRouter } from '../src/cv-routes.js';
import { CvPreviewError, MAX_CV_BYTES } from '../src/cv-preview.js';

const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n', 'ascii');

async function startTestServer(t, preview = async () => ({
  pageCount: 1,
  characterCount: 12,
  text: 'Synthetic CV',
  requiresOcr: false,
  reviewRequired: true,
  persisted: false
})) {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.get('x-test-role');
    if (role) req.user = { id: 1, role };
    next();
  });
  app.use('/api/cv', createCvRouter({ preview }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections?.();
  }));

  return `http://127.0.0.1:${server.address().port}/api/cv/preview`;
}

function makeForm({
  field = 'file',
  filename = 'resume.pdf',
  contentType = 'application/pdf',
  bytes = PDF_BYTES
} = {}) {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type: contentType }), filename);
  return form;
}

async function post(url, { role = 'recruiter', form = makeForm() } = {}) {
  const headers = role ? { 'x-test-role': role } : {};
  const response = await fetch(url, { method: 'POST', headers, body: form });
  return { response, payload: await response.json() };
}

test('admin and recruiter can submit one PDF to the preview service', async t => {
  const received = [];
  const url = await startTestServer(t, async buffer => {
    received.push(buffer);
    return { pageCount: 1, text: 'Synthetic CV', persisted: false };
  });

  for (const role of ['admin', 'recruiter']) {
    const { response, payload } = await post(url, { role });
    assert.equal(response.status, 200);
    assert.equal(payload.preview.persisted, false);
  }

  assert.equal(received.length, 2);
  assert.ok(received.every(buffer => Buffer.isBuffer(buffer) && buffer.equals(PDF_BYTES)));
});

test('unauthenticated users and hiring managers cannot upload CVs', async t => {
  let previewCalls = 0;
  const url = await startTestServer(t, async () => {
    previewCalls += 1;
    return { persisted: false };
  });

  const unauthenticated = await post(url, { role: null });
  assert.equal(unauthenticated.response.status, 401);

  const readOnly = await post(url, { role: 'hiring_manager' });
  assert.equal(readOnly.response.status, 403);
  assert.equal(previewCalls, 0);
});

test('rejects a non-PDF MIME type or filename before parsing', async t => {
  let previewCalls = 0;
  const url = await startTestServer(t, async () => {
    previewCalls += 1;
    return {};
  });

  const wrongMime = await post(url, {
    form: makeForm({ contentType: 'text/plain' })
  });
  assert.equal(wrongMime.response.status, 415);

  const wrongExtension = await post(url, {
    form: makeForm({ filename: 'resume.txt' })
  });
  assert.equal(wrongExtension.response.status, 415);
  assert.equal(previewCalls, 0);
});

test('requires exactly one file in the file field', async t => {
  const url = await startTestServer(t);

  const missing = await post(url, { form: new FormData() });
  assert.equal(missing.response.status, 400);

  const wrongField = await post(url, { form: makeForm({ field: 'resume' }) });
  assert.equal(wrongField.response.status, 400);

  const multiple = new FormData();
  multiple.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'one.pdf');
  multiple.append('file', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'two.pdf');
  const duplicate = await post(url, { form: multiple });
  assert.equal(duplicate.response.status, 400);
});

test('rejects uploads larger than the configured memory limit', async t => {
  const url = await startTestServer(t);
  const oversized = Buffer.alloc(MAX_CV_BYTES + 1, 0x61);
  oversized.write('%PDF-1.4', 0, 'ascii');
  const result = await post(url, { form: makeForm({ bytes: oversized }) });
  assert.equal(result.response.status, 413);
});

test('maps preview validation errors to their intended HTTP status', async t => {
  const url = await startTestServer(t, async () => {
    throw new CvPreviewError('The PDF is not supported.', 422);
  });

  const result = await post(url);
  assert.equal(result.response.status, 422);
  assert.equal(result.payload.error, 'The PDF is not supported.');
});
