import { Router } from 'express';
import type { Project, User, WorkPackage, WorkPackageInput } from '../../../shared/api-types.js';
import type { Database } from '../db/database.js';
import { conflict, isUniqueViolation, notFound, parseId } from '../http-error.js';
import type { TimeService } from '../services/time.service.js';
import { userOf } from '../user-context.js';
import * as v from '../validate.js';

type Row = Record<string, unknown>;

const MAX_BUDGET_QUARTERS = 100_000 * 4;

function toPackage(row: Row): WorkPackage {
  return {
    id: Number(row['id']),
    projectId: Number(row['project_id']),
    code: row['code'] === null ? null : String(row['code']),
    name: String(row['name']),
    active: Number(row['active']) === 1,
    budgetQuarters: row['budget_quarters'] === null ? null : Number(row['budget_quarters']),
    bookedQuarters: Number(row['booked']),
  };
}

interface Fields {
  code: string | null;
  name: string;
  active: boolean;
  budgetQuarters: number | null;
}

/** Übernimmt gesetzte Felder aus `input`, die übrigen aus `current`. */
function merge(input: WorkPackageInput, current: Fields): Fields {
  return {
    code: input.code === undefined ? current.code : v.optionalText(input.code, 'Code', 40),
    name: input.name === undefined ? current.name : v.text(input.name, 'Name', 120),
    active: input.active === undefined ? current.active : v.bool(input.active, 'active'),
    budgetQuarters:
      input.budgetQuarters === undefined
        ? current.budgetQuarters
        : input.budgetQuarters === null
          ? null
          : v.int(input.budgetQuarters, 'Budget (Viertelstunden)', 1, MAX_BUDGET_QUARTERS),
  };
}

const EMPTY: Fields = { code: null, name: '', active: true, budgetQuarters: null };

function duplicateCode(error: unknown): never {
  if (isUniqueViolation(error))
    throw conflict('Dieser Code ist bereits vergeben', 'DUPLICATE_CODE');
  throw error;
}

/** Projekte und Arbeitspakete – jeweils nur die des angemeldeten Benutzers. */
export function projectsRouter(db: Database, time: TimeService): Router {
  const router = Router();

  const list = (user: User): Project[] => {
    const packages = db
      .prepare(
        `SELECT wp.*, COALESCE((SELECT SUM(quarters) FROM booking b WHERE b.work_package_id = wp.id), 0) AS booked
           FROM work_package wp JOIN project p ON p.id = wp.project_id
          WHERE p.user_id = ? ORDER BY wp.active DESC, wp.code IS NULL, wp.code, wp.name`,
      )
      .all(user.id)
      .map(toPackage);
    return db
      .prepare(
        'SELECT * FROM project WHERE user_id = ? ORDER BY active DESC, code IS NULL, code, name',
      )
      .all(user.id)
      .map((row): Project => {
        const own = packages.filter((p) => p.projectId === Number(row['id']));
        return {
          id: Number(row['id']),
          code: row['code'] === null ? null : String(row['code']),
          name: String(row['name']),
          active: Number(row['active']) === 1,
          bookedQuarters: own.reduce((sum, p) => sum + p.bookedQuarters, 0),
          packages: own,
        };
      });
  };

  const projectOf = (user: User, id: number): Project => {
    const project = list(user).find((p) => p.id === id);
    if (!project) throw notFound('Projekt nicht gefunden');
    return project;
  };

  const packageOf = (user: User, id: number): WorkPackage => {
    const pkg = list(user)
      .flatMap((p) => p.packages)
      .find((p) => p.id === id);
    if (!pkg) throw notFound('Arbeitspaket nicht gefunden');
    return pkg;
  };

  router.get('/projects', (_req, res) => {
    res.json(list(userOf(res, time)));
  });

  router.post('/projects', (req, res) => {
    const user = userOf(res, time);
    const f = merge({ name: '', ...(req.body ?? {}) }, EMPTY);
    let id = 0;
    try {
      id = Number(
        db
          .prepare('INSERT INTO project (user_id, code, name, active) VALUES (?, ?, ?, ?)')
          .run(user.id, f.code, f.name, f.active ? 1 : 0).lastInsertRowid,
      );
    } catch (error) {
      duplicateCode(error);
    }
    res.status(201).json(projectOf(user, id));
  });

  router.patch('/projects/:id', (req, res) => {
    const user = userOf(res, time);
    const project = projectOf(user, parseId(req.params['id']));
    const f = merge(req.body ?? {}, { ...project, budgetQuarters: null });
    try {
      db.prepare('UPDATE project SET code = ?, name = ?, active = ? WHERE id = ?').run(
        f.code,
        f.name,
        f.active ? 1 : 0,
        project.id,
      );
    } catch (error) {
      duplicateCode(error);
    }
    res.json(projectOf(user, project.id));
  });

  router.delete('/projects/:id', (req, res) => {
    const user = userOf(res, time);
    const project = projectOf(user, parseId(req.params['id']));
    if (project.bookedQuarters > 0)
      throw conflict('Projekt hat Buchungen – bitte stattdessen archivieren', 'HAS_BOOKINGS');
    db.prepare('DELETE FROM project WHERE id = ?').run(project.id);
    res.status(204).end();
  });

  router.post('/projects/:id/packages', (req, res) => {
    const user = userOf(res, time);
    const project = projectOf(user, parseId(req.params['id']));
    const f = merge({ name: '', ...(req.body ?? {}) }, EMPTY);
    let id = 0;
    try {
      id = Number(
        db
          .prepare(
            `INSERT INTO work_package (project_id, code, name, active, budget_quarters)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(project.id, f.code, f.name, f.active ? 1 : 0, f.budgetQuarters).lastInsertRowid,
      );
    } catch (error) {
      duplicateCode(error);
    }
    res.status(201).json(packageOf(user, id));
  });

  router.patch('/packages/:id', (req, res) => {
    const user = userOf(res, time);
    const pkg = packageOf(user, parseId(req.params['id']));
    const f = merge(req.body ?? {}, pkg);
    try {
      db.prepare(
        'UPDATE work_package SET code = ?, name = ?, active = ?, budget_quarters = ? WHERE id = ?',
      ).run(f.code, f.name, f.active ? 1 : 0, f.budgetQuarters, pkg.id);
    } catch (error) {
      duplicateCode(error);
    }
    res.json(packageOf(user, pkg.id));
  });

  router.delete('/packages/:id', (req, res) => {
    const user = userOf(res, time);
    const pkg = packageOf(user, parseId(req.params['id']));
    if (pkg.bookedQuarters > 0)
      throw conflict('Arbeitspaket hat Buchungen – bitte stattdessen archivieren', 'HAS_BOOKINGS');
    db.prepare('DELETE FROM work_package WHERE id = ?').run(pkg.id);
    res.status(204).end();
  });

  return router;
}
