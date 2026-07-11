import type { Core } from '@strapi/strapi';

import type { DataMigration } from './runner';

/**
 * Issue #8 — race condition in the track endpoint left duplicate daily
 * aggregate rows for the same (issue, date). Strapi v5 stores the relation
 * in a link table (`magazine_stats_issue_lnk`), so a composite unique index
 * on (issue_id, date) is impossible on `magazine_stats` itself.
 *
 * Design instead: `magazine-stat` is system-managed (hidden, only track.ts
 * writes it), so the controller creates rows with a DETERMINISTIC
 * document_id — `stat-i{issueId}-{YYYY-MM-DD}` — and a unique index on
 * document_id makes (issue, date) unique transitively.
 *
 * This migration prepares existing data for that invariant:
 *   1. merges duplicate (issue, date) rows, summing every counter
 *   2. rewrites surviving document_ids to the deterministic format
 *   3. adds the unique index (idempotent)
 */

const STATS = 'magazine_stats';
const LINK = 'magazine_stats_issue_lnk';
const INDEX = 'uq_magazine_stats_document_id';

const COUNTERS = ['visits', 'depth_25', 'depth_50', 'depth_75', 'depth_100'];

const migration: DataMigration = {
  name: '006-magazine-stat-unique',

  async up(strapi: Core.Strapi) {
    const knex = strapi.db.connection;

    // 1. Merge duplicates: same issue + same date → keep lowest id, sum counters.
    const [dupGroups] = (await knex.raw(
      `SELECT l.magazine_issue_id AS issueId, s.date AS statDate,
              GROUP_CONCAT(s.id ORDER BY s.id) AS ids
         FROM ${STATS} s
         JOIN ${LINK} l ON l.magazine_stat_id = s.id
        GROUP BY l.magazine_issue_id, s.date
       HAVING COUNT(*) > 1`
    )) as [Array<{ issueId: number; statDate: string; ids: string }>];

    for (const group of dupGroups) {
      const ids = group.ids.split(',').map(Number);
      const [keeper, ...extras] = ids;

      const sums = COUNTERS.map(
        (c) => `${c} = (SELECT total FROM (SELECT COALESCE(SUM(${c}), 0) AS total FROM ${STATS} WHERE id IN (${ids.join(',')})) AS t_${c})`
      );
      // MySQL forbids re-reading the updated table in an UPDATE subquery
      // unless wrapped in a derived table — hence the nested SELECT alias.
      await knex.raw(`UPDATE ${STATS} SET ${sums.join(', ')} WHERE id = ?`, [keeper]);

      await knex(LINK).whereIn('magazine_stat_id', extras).delete();
      await knex(STATS).whereIn('id', extras).delete();

      strapi.log.info(
        `[data-migrations] Merged ${extras.length} duplicate stat row(s) into #${keeper} (issue ${group.issueId}, ${group.statDate}).`
      );
    }

    // 2. Rewrite document_id to the deterministic format for linked rows.
    await knex.raw(
      `UPDATE ${STATS} s
         JOIN ${LINK} l ON l.magazine_stat_id = s.id
          SET s.document_id = CONCAT('stat-i', l.magazine_issue_id, '-', DATE_FORMAT(s.date, '%Y-%m-%d'))
        WHERE s.date IS NOT NULL`
    );

    // 3. Unique index on document_id (idempotent).
    const [indexRows] = (await knex.raw(
      `SELECT COUNT(*) AS n FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [STATS, INDEX]
    )) as [Array<{ n: number }>];

    if (Number(indexRows[0]?.n) === 0) {
      await knex.raw(`CREATE UNIQUE INDEX ${INDEX} ON ${STATS} (document_id)`);
      strapi.log.info(`[data-migrations] Unique index ${INDEX} created.`);
    } else {
      strapi.log.info(`[data-migrations] Unique index ${INDEX} already exists — skipping.`);
    }
  },
};

export default migration;
