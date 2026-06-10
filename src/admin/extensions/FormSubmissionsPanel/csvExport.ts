import type { FormFieldDef, Submission } from './useFormSubmissions';

// RFC 4180 + Excel hardening:
// - BOM for Excel UTF-8 detection
// - CRLF line endings
// - Every data cell value is prefixed with \t before quoting — this neutralises
//   formula injection (=, +, -, @) because Excel treats the cell as plain text.
// - Headers come from our own code so they receive no tab prefix.

const BOM = '﻿';
const CRLF = '\r\n';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function quoteCell(raw: string, isHeader: boolean): string {
  const content = isHeader ? raw : `\t${raw}`;
  return `"${content.replace(/"/g, '""')}"`;
}

function buildRow(cells: string[], isHeader: boolean): string {
  return cells.map((c) => quoteCell(c, isHeader)).join(',');
}

export function buildCsv(submissions: Submission[], fields: FormFieldDef[]): string {
  const headerLabels = ['Fecha de envío', ...fields.map((f) => f.label), 'IP'];

  const lines: string[] = [buildRow(headerLabels, true)];

  for (const s of submissions) {
    const submittedAt = s.submitted_at
      ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
          new Date(s.submitted_at),
        )
      : '';
    const dataCells = fields.map((f) => formatCell((s.data as Record<string, unknown>)[f.name]));
    const ip = formatCell(s.ip_address);
    lines.push(buildRow([submittedAt, ...dataCells, ip], false));
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
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

export function downloadCsv(
  submissions: Submission[],
  fields: FormFieldDef[],
  formTitle: string,
): void {
  const csv = buildCsv(submissions, fields);
  const slug = slugify(formTitle) || 'formulario';
  const filename = `envios-${slug}-${formatDateForFilename(new Date())}.csv`;

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
