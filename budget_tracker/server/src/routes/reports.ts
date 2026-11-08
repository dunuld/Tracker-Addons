import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { accountIdParam, badRequest } from '../http-error.js';
import { ReportService } from '../services/report.service.js';

/** `YYYY-MM` mit gültigem Monat 01–12. */
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_TREND_MONTHS = 120;

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));

export function reportsRouter(db: DatabaseSync): Router {
  const router = Router();
  const reportService = new ReportService(db);

  router.get('/monthly', (req, res) => {
    const year = Number(req.query['year']);
    const month = Number(req.query['month']);
    if (!Number.isInteger(year) || !Number.isInteger(month)) {
      throw badRequest('year und month sind erforderlich (z. B. ?year=2026&month=10)');
    }
    if (month < 1 || month > 12) throw badRequest('month muss zwischen 1 und 12 liegen');
    res.json(reportService.monthly(year, month, accountIdParam(req.query['accountId'])));
  });

  router.get('/trend', (req, res) => {
    const from = String(req.query['from'] ?? '');
    const to = String(req.query['to'] ?? '');
    if (!YEAR_MONTH.test(from)) throw badRequest('from ist erforderlich (Format YYYY-MM)');
    if (!YEAR_MONTH.test(to)) throw badRequest('to ist erforderlich (Format YYYY-MM)');
    if (from > to) throw badRequest('from darf nicht größer als to sein');
    if (monthIndex(to) - monthIndex(from) >= MAX_TREND_MONTHS) {
      throw badRequest(`Zeitraum darf höchstens ${MAX_TREND_MONTHS} Monate umfassen`);
    }
    res.json(reportService.trend(from, to, accountIdParam(req.query['accountId'])));
  });

  return router;
}
