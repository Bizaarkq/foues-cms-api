import {
  Box,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import type { FormFieldDef, Submission } from './useFormSubmissions';

interface Props {
  submissions: Submission[];
  fields: FormFieldDef[];
  truncated: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function SubmissionsTable({ submissions, fields, truncated }: Props) {
  if (submissions.length === 0) {
    return (
      <Box padding={4}>
        <Typography variant="omega" textColor="neutral600">
          Este formulario aún no tiene envíos.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {truncated && (
        <Box
          paddingTop={2}
          paddingBottom={2}
          paddingLeft={4}
          paddingRight={4}
          background="warning100"
        >
          <Typography variant="pi" textColor="warning700">
            Se muestran solo los 200 envíos más recientes.
          </Typography>
        </Box>
      )}

      <Table colCount={fields.length + 2} rowCount={submissions.length}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma" textColor="neutral600">
                Fecha de envío
              </Typography>
            </Th>
            {fields.map((f) => (
              <Th key={f.name}>
                <Typography variant="sigma" textColor="neutral600">
                  {f.label}
                </Typography>
              </Th>
            ))}
            <Th>
              <Typography variant="sigma" textColor="neutral600">
                IP
              </Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {submissions.map((s) => {
            const data = (s.data ?? {}) as Record<string, unknown>;
            const submittedAt = s.submitted_at
              ? dateFormatter.format(new Date(s.submitted_at))
              : '—';

            return (
              <Tr key={s.documentId}>
                <Td>
                  <Typography variant="omega">{submittedAt}</Typography>
                </Td>
                {fields.map((f) => (
                  <Td key={f.name}>
                    <Typography variant="omega">{formatCell(data[f.name])}</Typography>
                  </Td>
                ))}
                <Td>
                  <Typography variant="omega">{s.ip_address ?? '—'}</Typography>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </Box>
  );
}
