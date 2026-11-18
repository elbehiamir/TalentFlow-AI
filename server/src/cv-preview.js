import { PDFParse } from 'pdf-parse';
import { extractCvSkills } from './cv-skills.js';

export const MAX_CV_BYTES = 5 * 1024 * 1024;
export const MAX_CV_PAGES = 5;
export const MAX_CV_TEXT_CHARS = 60000;
export const CV_PARSE_TIMEOUT_MS = 12000;

const EOF_MARKER = Buffer.from('%%EOF', 'ascii');
const ACTIVE_PDF_FEATURES = /\/(?:JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|OpenAction|AA|XFA)\b/i;

export class CvPreviewError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'CvPreviewError';
    this.status = status;
  }
}

export function validatePdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new CvPreviewError('The uploaded file is not a valid PDF.', 415);
  }
  if (buffer.length > MAX_CV_BYTES) {
    throw new CvPreviewError('PDF files must be 5 MB or smaller.', 413);
  }
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new CvPreviewError('The file content does not have a PDF signature.', 415);
  }

  const eofIndex = buffer.lastIndexOf(EOF_MARKER);
  if (eofIndex < 0 || buffer.length - eofIndex > 2048) {
    throw new CvPreviewError('The PDF is incomplete or has an invalid ending.', 422);
  }

  const source = buffer.toString('latin1');
  if (/\/Encrypt\b/i.test(source)) {
    throw new CvPreviewError('Password-protected PDFs are not supported.', 422);
  }
  if (ACTIVE_PDF_FEATURES.test(source)) {
    throw new CvPreviewError('This PDF contains unsupported active content or embedded files.', 422);
  }

  return true;
}

function normalizeExtractedText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .normalize('NFKC')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function createCvPreview(buffer, {
  Parser = PDFParse,
  timeoutMs = CV_PARSE_TIMEOUT_MS
} = {}) {
  validatePdfBuffer(buffer);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('timeoutMs must be a positive integer.');
  }

  let parser;
  let timeout;
  try {
    parser = new Parser({ data: new Uint8Array(buffer) });

    const parseTask = (async () => {
      const info = await parser.getInfo();
      const pageCount = Number(info?.total);
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new CvPreviewError('The PDF page count could not be determined.', 422);
      }
      if (pageCount > MAX_CV_PAGES) {
        throw new CvPreviewError('CV previews are limited to 5 pages.', 413);
      }

      const result = await parser.getText({ first: MAX_CV_PAGES });
      const text = normalizeExtractedText(result?.text);
      if (text.length > MAX_CV_TEXT_CHARS) {
        throw new CvPreviewError('The extracted text is too large to preview.', 413);
      }

      return {
        pageCount,
        characterCount: text.length,
        text,
        requiresOcr: text.length === 0,
        skillSuggestions: extractCvSkills(text),
        reviewRequired: true,
        persisted: false
      };
    })();

    const timeoutTask = new Promise((_, reject) => {
      timeout = setTimeout(() => {
        reject(new CvPreviewError('PDF processing took too long. Try a simpler PDF.', 408));
      }, timeoutMs);
    });

    return await Promise.race([parseTask, timeoutTask]);
  } catch (error) {
    if (error instanceof CvPreviewError) throw error;
    throw new CvPreviewError('The PDF could not be read. Use an unencrypted, text-based PDF.', 422);
  } finally {
    if (timeout) clearTimeout(timeout);
    try {
      await parser?.destroy?.();
    } catch {
      // Cleanup must not expose parser internals or replace the request result.
    }
  }
}
