import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { OpeningInput, PriceInput, SecurityUpdate } from '../../shared/api-types.js';
import type { DepotService } from './depot.service.js';
import { HttpError, badRequest, notFound, parseId } from './http-error.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 50;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES, fields: 5 },
});

/** multer-Fehler in verständliche HTTP-Fehler übersetzen. */
const files: RequestHandler = (req, res, next) => {
  upload.array('files', MAX_UPLOAD_FILES)(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(
          new HttpError(413, 'Eine Datei ist zu groß (maximal 10 MB).', 'FILE_TOO_LARGE'),
        );
      }
      return next(badRequest(`Ungültiger Upload: ${error.message}`, 'INVALID_UPLOAD'));
    }
    next(error);
  });
};

function parseYear(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1990 || year > 2200) {
    throw badRequest('Ungültiges Jahr.', 'INVALID_YEAR');
  }
  return year;
}

const body = <T>(value: unknown): Partial<T> =>
  value && typeof value === 'object' ? (value as Partial<T>) : {};

export function depotRouter(depot: DepotService, scanInbox?: () => Promise<unknown>): Router {
  const router = Router();

  router.get('/overview', (req, res) => {
    res.json(depot.overview(parseYear(req.query['year'])));
  });

  // ---- Dokumente ----
  router.get('/documents', (_req, res) => {
    res.json(depot.listDocuments());
  });

  router.post('/documents', files, async (req, res) => {
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (uploaded.length === 0)
      throw badRequest('Keine Datei hochgeladen (Feld "files").', 'NO_FILE');
    const results = [];
    for (const file of uploaded) {
      results.push(await depot.importPdf(file.buffer, file.originalname, 'upload'));
    }
    res.json(results);
  });

  router.get('/documents/:id/file', (req, res) => {
    const id = parseId(req.params['id']);
    const file = depot.documentFile(id);
    if (!file) throw notFound('Die Original-PDF ist nicht gespeichert.');
    res.type('application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(file);
  });

  router.delete('/documents/:id', (req, res) => {
    depot.deleteDocument(parseId(req.params['id']));
    res.status(204).end();
  });

  // ---- Eingangsordner ----
  router.post('/inbox/scan', async (_req, res) => {
    res.json((await scanInbox?.()) ?? []);
  });

  router.get('/import-failures', (_req, res) => {
    res.json(depot.listFailures());
  });

  router.delete('/import-failures/:id', (req, res) => {
    depot.deleteFailure(parseId(req.params['id']));
    res.status(204).end();
  });

  // ---- Buchungen ----
  router.get('/transactions', (req, res) => {
    res.json(depot.listTransactions(parseYear(req.query['year'])));
  });

  router.post('/transactions', (req, res) => {
    res.status(201).json(depot.addOpening(body<OpeningInput>(req.body)));
  });

  router.delete('/transactions/:id', (req, res) => {
    depot.deleteTransaction(parseId(req.params['id']));
    res.status(204).end();
  });

  // ---- Wertpapiere / Kurse ----
  router.put('/securities/:isin', (req, res) => {
    depot.setPriceEntity(String(req.params['isin']), body<SecurityUpdate>(req.body).priceEntity);
    res.status(204).end();
  });

  router.post('/securities/:isin/prices', (req, res) => {
    depot.addPrice(String(req.params['isin']), body<PriceInput>(req.body));
    res.status(204).end();
  });

  return router;
}
