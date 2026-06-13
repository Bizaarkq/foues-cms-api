import type { MagazineStat } from './useMagazineStats';

// RFC 4180 + Excel hardening — same conventions as FormSubmissionsPanel/csvExport.ts:
// BOM for UTF-8 detection, CRLF line endings, tab-prefix on data cells to neutralise
// formula injection (=, +, -, @).

const BOM = '﻿';
const CRLF = '\r\n';

function quoteCell(raw: string, isHeader: boolean): string {
  const content = isHeader ? raw : `\t${raw}`;
  return `"${content.replace(/"/g, '""')}"`;
}

function buildRow(cells: string[], isHeader: boolean): string {
  return cells.map((c) => quoteCell(c, isHeader)).join(',');
}

export function buildStatsCsv(stats: MagazineStat[]): string {
  const headers = ['Fecha', 'Visitas', 'Leído 25%', 'Leído 50%', 'Leído 75%', 'Leído 100%'];
  const lines: string[] = [buildRow(headers, true)];

  for (const s of stats) {
    lines.push(
      buildRow(
        [
          s.date,
          String(s.visits),
          String(s.depth25),
          String(s.depth50),
          String(s.depth75),
          String(s.depth100),
        ],
        false,
      ),
    );
  }

  return BOM + lines.join(CRLF) + CRLF;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDateForFilename(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function downloadStatsCsv(stats: MagazineStat[], issueTitle: string): void {
  const csv = buildStatsCsv(stats);
  const slug = slugify(issueTitle) || 'revista';
  const filename = `estadisticas-${slug}-${formatDateForFilename(new Date())}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    window.open(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
