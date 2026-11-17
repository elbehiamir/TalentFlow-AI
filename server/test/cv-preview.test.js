import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCvPreview,
  CvPreviewError,
  MAX_CV_BYTES,
  MAX_CV_PAGES,
  MAX_CV_TEXT_CHARS,
  validatePdfBuffer
} from '../src/cv-preview.js';

function makeMinimalPdf(stream = 'BT /F1 12 Tf 30 100 Td (Synthetic CV sample) Tj ET') {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream\nendobj\n'
  ];

  let source = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(source, 'latin1'));
    source += object;
  }

  const xrefOffset = Buffer.byteLength(source, 'latin1');
  source += 'xref\n0 6\n0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    source += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  }
  source += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
  return Buffer.from(source, 'latin1');
}

function fakeParser({ total = 1, text = 'Sample CV text', infoError = null, textError = null } = {}) {
  const state = { destroyed: false, textCalls: 0 };
  class FakeParser {
    constructor() {}
    async getInfo() {
      if (infoError) throw infoError;
      return { total };
    }
    async getText() {
      state.textCalls += 1;
      if (textError) throw textError;
      return { text };
    }
    async destroy() {
      state.destroyed = true;
    }
  }
  return { Parser: FakeParser, state };
}

test('accepts a PDF with a header and end marker', () => {
  assert.equal(validatePdfBuffer(makeMinimalPdf()), true);
});

test('rejects a file without a PDF signature', () => {
  assert.throws(
    () => validatePdfBuffer(Buffer.from('not a pdf %%EOF')),
    error => error instanceof CvPreviewError && error.status === 415
  );
});

test('rejects a truncated PDF without an end marker', () => {
  assert.throws(
    () => validatePdfBuffer(Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\n')),
    error => error instanceof CvPreviewError && error.status === 422
  );
});

test('rejects files larger than the upload limit', () => {
  const oversized = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_CV_BYTES), Buffer.from('\n%%EOF')]);
  assert.throws(
    () => validatePdfBuffer(oversized),
    error => error instanceof CvPreviewError && error.status === 413
  );
});

test('rejects encrypted and obvious active-content PDFs', () => {
  for (const marker of ['/Encrypt', '/JavaScript', '/EmbeddedFile']) {
    assert.throws(
      () => validatePdfBuffer(makeMinimalPdf('(' + marker + ') Tj')),
      error => error instanceof CvPreviewError && error.status === 422
    );
  }
});

test('extracts text from a small synthetic PDF with the real parser', async () => {
  const result = await createCvPreview(makeMinimalPdf());
  assert.equal(result.pageCount, 1);
  assert.match(result.text, /Synthetic CV sample/);
  assert.equal(result.requiresOcr, false);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.persisted, false);
});

test('normalizes extracted text and always destroys the parser', async () => {
  const { Parser, state } = fakeParser({ text: '  Amir\r\nElbehi\u0000Frontend  ' });
  const result = await createCvPreview(makeMinimalPdf(), { Parser });
  assert.equal(result.text, 'Amir\nElbehi Frontend');
  assert.equal(state.destroyed, true);
});

test('marks image-only PDFs as requiring OCR without inventing text', async () => {
  const { Parser } = fakeParser({ text: '   \n  ' });
  const result = await createCvPreview(makeMinimalPdf(), { Parser });
  assert.equal(result.text, '');
  assert.equal(result.requiresOcr, true);
});

test('rejects PDFs over the page limit before extracting text', async () => {
  const { Parser, state } = fakeParser({ total: MAX_CV_PAGES + 1 });
  await assert.rejects(
    createCvPreview(makeMinimalPdf(), { Parser }),
    error => error instanceof CvPreviewError && error.status === 413
  );
  assert.equal(state.textCalls, 0);
  assert.equal(state.destroyed, true);
});

test('rejects excessive extracted text and cleans up the parser', async () => {
  const { Parser, state } = fakeParser({ text: 'x'.repeat(MAX_CV_TEXT_CHARS + 1) });
  await assert.rejects(
    createCvPreview(makeMinimalPdf(), { Parser }),
    error => error instanceof CvPreviewError && error.status === 413
  );
  assert.equal(state.destroyed, true);
});

test('hides internal parser errors from API callers', async () => {
  const { Parser, state } = fakeParser({ infoError: new Error('internal parser detail') });
  await assert.rejects(
    createCvPreview(makeMinimalPdf(), { Parser }),
    error => error instanceof CvPreviewError &&
      error.status === 422 &&
      !error.message.includes('internal parser detail')
  );
  assert.equal(state.destroyed, true);
});

test('times out slow parsing and still destroys the parser', async () => {
  const state = { destroyed: false };
  class SlowParser {
    async getInfo() {
      return new Promise(() => {});
    }
    async destroy() {
      state.destroyed = true;
    }
  }

  await assert.rejects(
    createCvPreview(makeMinimalPdf(), { Parser: SlowParser, timeoutMs: 5 }),
    error => error instanceof CvPreviewError && error.status === 408
  );
  assert.equal(state.destroyed, true);
});
