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
import type { MagazineStat } from './useMagazineStats';

interface Props {
  stats: MagazineStat[];
}

export function StatsTable({ stats }: Props) {
  if (stats.length === 0) {
    return (
      <Box padding={4}>
        <Typography variant="omega" textColor="neutral600">
          Esta edición aún no tiene estadísticas registradas.
        </Typography>
      </Box>
    );
  }

  return (
    <Table colCount={6} rowCount={stats.length}>
      <Thead>
        <Tr>
          <Th>
            <Typography variant="sigma" textColor="neutral600">
              Fecha
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma" textColor="neutral600">
              Visitas
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma" textColor="neutral600">
              Leído 25%
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma" textColor="neutral600">
              Leído 50%
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma" textColor="neutral600">
              Leído 75%
            </Typography>
          </Th>
          <Th>
            <Typography variant="sigma" textColor="neutral600">
              Leído 100%
            </Typography>
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {stats.map((s) => (
          <Tr key={s.documentId}>
            <Td>
              <Typography variant="omega">{s.date}</Typography>
            </Td>
            <Td>
              <Typography variant="omega">{s.visits}</Typography>
            </Td>
            <Td>
              <Typography variant="omega">{s.depth25}</Typography>
            </Td>
            <Td>
              <Typography variant="omega">{s.depth50}</Typography>
            </Td>
            <Td>
              <Typography variant="omega">{s.depth75}</Typography>
            </Td>
            <Td>
              <Typography variant="omega">{s.depth100}</Typography>
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
