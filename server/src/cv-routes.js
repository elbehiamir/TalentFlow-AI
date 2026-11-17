import { Router } from 'express';
import multer from 'multer';
import { requireRoles } from './auth.js';
import {
  createCvPreview,
  CvPreviewError,
  MAX_CV_BYTES
} from './cv-preview.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CV_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
    headerPairs: 50
  },
  fileFilter(_req, file, callback) {
    const hasPdfName = typeof file.originalname === 'string' && /\.pdf$/i.test(file.originalname);
    if (file.mimetype !== 'application/pdf' || !hasPdfName) {
      callback(new CvPreviewError('Upload one PDF file with a .pdf extension.', 415));
      return;
    }
    callback(null, true);
  }
});

function receiveSinglePdf(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? 'PDF files must be 5 MB or smaller.'
          : 'Upload exactly one PDF file using the file field.'
      });
    }

    if (error instanceof CvPreviewError) {
      return res.status(error.status).json({ error: error.message });
    }

    next(error);
  });
}

export function createCvRouter({ preview = createCvPreview } = {}) {
  const router = Router();

  router.post('/preview', requireRoles('admin', 'recruiter'), receiveSinglePdf, async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a PDF file to preview.' });
    }

    try {
      const result = await preview(req.file.buffer);
      res.json({ preview: result });
    } catch (error) {
      if (error instanceof CvPreviewError) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  });

  return router;
}
