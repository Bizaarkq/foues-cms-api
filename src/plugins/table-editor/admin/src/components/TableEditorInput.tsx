import * as React from 'react';

import {
  Alert,
  Box,
  Button,
  Field,
  Flex,
  IconButton,
  Modal,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { useField } from '@strapi/strapi/admin';

/**
 * TableEditorInput — admin UI for the plugin::table-editor.table custom field.
 *
 * Stores plain JSON with the shape { headers: string[], rows: string[][] }.
 * The grid is always hand-editable; the CSV/Excel import is a convenience
 * that fills the same grid after an explicit preview confirmation. Parse
 * errors stay in the admin (Spanish copy) — invalid data is never saved
 * because onChange only ever receives a normalized TableValue (or null).
 */

interface TableValue {
  headers: string[];
  rows: string[][];
}

interface TableEditorInputProps {
  attribute?: { type: string; customField?: string };
  disabled?: boolean;
  hint?: React.ReactNode;
  label?: string;
  labelAction?: React.ReactNode;
  name: string;
  required?: boolean;
}

const PREVIEW_ROW_LIMIT = 50;

// Import caps: blocks.table is served in full over public GraphQL and the grid
// renders one controlled input per cell, so oversized imports must be rejected
// at the door rather than committed.
const MAX_IMPORT_ROWS = 500;
const MAX_IMPORT_COLS = 40;
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const toCellText = (cell: unknown): string => {
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  return '';
};

/** Normalizes the stored JSON (object, or string on some load paths). */
const parseValue = (value: unknown): TableValue | null => {
  let candidate: unknown = value;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return null;
  }

  const { headers, rows } = candidate as { headers?: unknown; rows?: unknown };
  if (!Array.isArray(headers) || headers.length === 0) return null;

  const safeHeaders = headers.map(toCellText);
  const safeRows = (Array.isArray(rows) ? rows : [])
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => safeHeaders.map((_, col) => toCellText(row[col])));

  return { headers: safeHeaders, rows: safeRows };
};

/**
 * Builds a TableValue from raw file rows (first row becomes the headers).
 * Returns a Spanish error message when the content is unusable.
 */
const fromImportedRows = (rawRows: unknown[][]): TableValue | string => {
  const rows = rawRows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map(toCellText));

  const nonEmpty = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) {
    return 'El archivo está vacío o no contiene datos legibles.';
  }

  if (nonEmpty.length - 1 > MAX_IMPORT_ROWS) {
    return `El archivo tiene ${nonEmpty.length - 1} filas de datos; el máximo permitido es ${MAX_IMPORT_ROWS}.`;
  }

  // Widen to the longest row so ragged input never loses cells silently.
  const width = Math.max(...nonEmpty.map((row) => row.length));
  if (width > MAX_IMPORT_COLS) {
    return `El archivo tiene ${width} columnas; el máximo permitido es ${MAX_IMPORT_COLS}.`;
  }

  const headers = nonEmpty[0].concat(
    Array.from({ length: width - nonEmpty[0].length }, (_, i) => `Columna ${nonEmpty[0].length + i + 1}`)
  );
  if (headers.every((header) => header.trim() === '')) {
    return 'La primera fila del archivo (los encabezados) está vacía.';
  }

  return {
    headers,
    rows: nonEmpty.slice(1).map((row) => headers.map((_, col) => row[col] ?? '')),
  };
};

const parseCsvFile = async (file: File): Promise<unknown[][]> => {
  const { default: Papa } = await import('papaparse');

  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.data.length === 0 && results.errors.length > 0) {
          reject(new Error(results.errors[0].message));
        } else {
          resolve(results.data);
        }
      },
      error: (error: Error) => reject(error),
    });
  });
};

const parseExcelFile = async (file: File): Promise<unknown[][]> => {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('workbook has no sheets');
  }

  return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
  });
};

const TrashIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const TableEditorInput = React.forwardRef<HTMLDivElement, TableEditorInputProps>(
  ({ hint, disabled = false, labelAction, label, name, required = false }, ref) => {
    const field = useField<unknown>(name);
    const table = React.useMemo(() => parseValue(field.value), [field.value]);

    const [importError, setImportError] = React.useState<string | null>(null);
    const [preview, setPreview] = React.useState<TableValue | null>(null);
    const [importing, setImporting] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const commit = (next: TableValue | null) => {
      field.onChange(name, next);
    };

    // --- manual grid edition -------------------------------------------------

    const updateHeader = (col: number, text: string) => {
      if (!table) return;
      const headers = table.headers.map((h, i) => (i === col ? text : h));
      commit({ headers, rows: table.rows });
    };

    const updateCell = (rowIndex: number, col: number, text: string) => {
      if (!table) return;
      const rows = table.rows.map((row, r) =>
        r === rowIndex ? row.map((cell, c) => (c === col ? text : cell)) : row
      );
      commit({ headers: table.headers, rows });
    };

    const addRow = () => {
      if (!table) return;
      commit({ headers: table.headers, rows: [...table.rows, table.headers.map(() => '')] });
    };

    const addColumn = () => {
      if (!table) return;
      commit({
        headers: [...table.headers, ''],
        rows: table.rows.map((row) => [...row, '']),
      });
    };

    const removeRow = (rowIndex: number) => {
      if (!table) return;
      commit({ headers: table.headers, rows: table.rows.filter((_, r) => r !== rowIndex) });
    };

    const removeColumn = (col: number) => {
      if (!table) return;
      if (table.headers.length === 1) {
        // Removing the last column leaves no table at all.
        commit(null);
        return;
      }
      commit({
        headers: table.headers.filter((_, c) => c !== col),
        rows: table.rows.map((row) => row.filter((_, c) => c !== col)),
      });
    };

    const createEmptyTable = () => {
      commit({ headers: ['', ''], rows: [['', '']] });
    };

    // --- CSV / Excel import --------------------------------------------------

    const handleFile = async (file: File) => {
      setImportError(null);

      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setImportError(
          `El archivo pesa más de ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB. Reducí los datos e intentá de nuevo.`
        );
        return;
      }

      setImporting(true);

      try {
        const extension = file.name.toLowerCase().split('.').pop() ?? '';
        let rawRows: unknown[][];

        if (extension === 'csv') {
          rawRows = await parseCsvFile(file);
        } else if (extension === 'xlsx' || extension === 'xls') {
          rawRows = await parseExcelFile(file);
        } else {
          setImportError('Formato no soportado. Seleccioná un archivo .csv, .xlsx o .xls.');
          return;
        }

        const result = fromImportedRows(rawRows);
        if (typeof result === 'string') {
          setImportError(result);
          return;
        }

        setPreview(result);
      } catch {
        setImportError(
          'No se pudo leer el archivo. Verificá que no esté dañado e intentá de nuevo.'
        );
      } finally {
        setImporting(false);
      }
    };

    const onFileSelected: React.ChangeEventHandler<HTMLInputElement> = (event) => {
      const file = event.target.files?.[0];
      // Reset so selecting the same file again re-triggers the change event.
      event.target.value = '';
      if (file) {
        void handleFile(file);
      }
    };

    const confirmImport = () => {
      if (preview) {
        commit(preview);
        setPreview(null);
      }
    };

    // --- render ----------------------------------------------------------------

    const cellStyle: React.CSSProperties = { padding: '2px', verticalAlign: 'middle' };

    return (
      <Field.Root name={name} id={name} error={field.error} hint={hint} required={required}>
        <Flex direction="column" alignItems="stretch" gap={2} ref={ref}>
          <Field.Label action={labelAction}>{label}</Field.Label>

          {importError && (
            <Alert
              variant="danger"
              title="Error de importación"
              closeLabel="Cerrar"
              onClose={() => setImportError(null)}
            >
              {importError}
            </Alert>
          )}

          {!table ? (
            <Flex direction="column" alignItems="flex-start" gap={2}>
              <Typography variant="pi" textColor="neutral600">
                Todavía no hay datos. Creá la tabla a mano o importá un archivo CSV/Excel.
              </Typography>
              <Flex gap={2}>
                <Button variant="secondary" onClick={createEmptyTable} disabled={disabled}>
                  Crear tabla
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || importing}
                  loading={importing}
                >
                  Importar CSV/Excel
                </Button>
              </Flex>
            </Flex>
          ) : (
            <Flex direction="column" alignItems="stretch" gap={2}>
              <Box overflow="auto" borderColor="neutral200" hasRadius padding={2}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {table.headers.map((header, col) => (
                        <th key={col} style={cellStyle}>
                          <Flex gap={1} alignItems="center">
                            <TextInput
                              size="S"
                              aria-label={`Encabezado de la columna ${col + 1}`}
                              placeholder="Encabezado"
                              value={header}
                              disabled={disabled}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                updateHeader(col, e.target.value)
                              }
                            />
                            <IconButton
                              label={`Eliminar columna ${col + 1}`}
                              variant="ghost"
                              size="XS"
                              disabled={disabled}
                              onClick={() => removeColumn(col)}
                            >
                              <TrashIcon />
                            </IconButton>
                          </Flex>
                        </th>
                      ))}
                      <th style={cellStyle} aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, col) => (
                          <td key={col} style={cellStyle}>
                            <TextInput
                              size="S"
                              aria-label={`Fila ${rowIndex + 1}, columna ${col + 1}`}
                              value={cell}
                              disabled={disabled}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                updateCell(rowIndex, col, e.target.value)
                              }
                            />
                          </td>
                        ))}
                        <td style={cellStyle}>
                          <IconButton
                            label={`Eliminar fila ${rowIndex + 1}`}
                            variant="ghost"
                            size="XS"
                            disabled={disabled}
                            onClick={() => removeRow(rowIndex)}
                          >
                            <TrashIcon />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>

              <Flex gap={2} wrap="wrap">
                <Button variant="secondary" onClick={addRow} disabled={disabled}>
                  Agregar fila
                </Button>
                <Button variant="secondary" onClick={addColumn} disabled={disabled}>
                  Agregar columna
                </Button>
                <Button
                  variant="tertiary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || importing}
                  loading={importing}
                >
                  Importar CSV/Excel
                </Button>
                <Button
                  variant="danger-light"
                  onClick={() => {
                    if (window.confirm('¿Vaciar toda la tabla? Se perderán las filas actuales.')) {
                      commit(null);
                    }
                  }}
                  disabled={disabled}
                >
                  Vaciar tabla
                </Button>
              </Flex>
            </Flex>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={onFileSelected}
            disabled={disabled}
          />

          <Field.Hint />
          <Field.Error />
        </Flex>

        <Modal.Root
          open={preview !== null}
          onOpenChange={(open: boolean) => {
            if (!open) setPreview(null);
          }}
        >
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>Vista previa de la importación</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {preview && (
                <Flex direction="column" alignItems="stretch" gap={2}>
                  <Typography variant="pi" textColor="neutral600">
                    {preview.rows.length === 1
                      ? 'Se importará 1 fila.'
                      : `Se importarán ${preview.rows.length} filas.`}{' '}
                    Los datos reemplazan el contenido actual de la grilla y quedan editables.
                  </Typography>
                  <Box overflow="auto">
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          {preview.headers.map((header, col) => (
                            <th
                              key={col}
                              style={{
                                padding: '6px 8px',
                                textAlign: 'left',
                                borderBottom: '1px solid #ddd',
                              }}
                            >
                              <Typography fontWeight="bold">{header || '—'}</Typography>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {row.map((cell, col) => (
                              <td
                                key={col}
                                style={{
                                  padding: '6px 8px',
                                  borderBottom: '1px solid #eee',
                                }}
                              >
                                <Typography>{cell}</Typography>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                  {preview.rows.length > PREVIEW_ROW_LIMIT && (
                    <Typography variant="pi" textColor="neutral600">
                      Mostrando las primeras {PREVIEW_ROW_LIMIT} filas de {preview.rows.length}.
                    </Typography>
                  )}
                </Flex>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Modal.Close>
                <Button variant="tertiary">Cancelar</Button>
              </Modal.Close>
              <Button onClick={confirmImport}>Usar estos datos</Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      </Field.Root>
    );
  }
);

TableEditorInput.displayName = 'TableEditorInput';

export default TableEditorInput;
