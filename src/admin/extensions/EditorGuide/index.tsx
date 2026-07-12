import { useMemo, useState } from 'react';
import { Box, Flex, TextInput, Typography } from '@strapi/design-system';

import { FIELDS_DOC, type EntryDoc, type SectionDoc } from './fields-doc';

/**
 * Guía del editor — página del admin (menú lateral) con la documentación de
 * todos los campos editables, buscable. La fuente de verdad es fields-doc.ts.
 */

function matches(entry: EntryDoc, q: string): boolean {
  if (entry.title.toLowerCase().includes(q)) return true;
  return entry.fields.some(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.label.toLowerCase().includes(q) ||
      f.help.toLowerCase().includes(q)
  );
}

function EntryCard({ entry, forceOpen }: { entry: EntryDoc; forceOpen: boolean }) {
  return (
    <Box
      background="neutral0"
      hasRadius
      shadow="tableShadow"
      padding={4}
      marginBottom={3}
    >
      <details open={forceOpen}>
        <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
          <Typography fontWeight="bold" tag="span">
            {entry.title}
          </Typography>
          {entry.description ? (
            <Typography textColor="neutral600" tag="span">
              {' '}
              — {entry.description}
            </Typography>
          ) : null}
        </summary>
        <Box paddingTop={3}>
          {entry.fields.map((field) => (
            <Box key={field.name} paddingBottom={3}>
              <Flex gap={2} wrap="wrap" alignItems="baseline">
                <Typography fontWeight="semiBold">{field.label}</Typography>
                <Typography textColor="neutral500" variant="pi">
                  ({field.name})
                </Typography>
              </Flex>
              <Typography textColor="neutral700" tag="p">
                {field.help}
              </Typography>
              {field.values && field.values.length > 0 ? (
                <Typography textColor="neutral600" variant="pi" tag="p">
                  Valores: {field.values.join(' · ')}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Box>
      </details>
    </Box>
  );
}

export function EditorGuidePage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const visible: SectionDoc[] = useMemo(() => {
    if (!q) return FIELDS_DOC;
    return FIELDS_DOC.map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => matches(entry, q)),
    })).filter((section) => section.entries.length > 0);
  }, [q]);

  return (
    <Box padding={8} background="neutral100" minHeight="100vh">
      <Box marginBottom={6}>
        <Typography variant="alpha" tag="h1">
          Guía del editor
        </Typography>
        <Typography textColor="neutral600" tag="p">
          Qué significa y cómo se usa cada campo del contenido. Buscá por nombre
          de bloque, de campo o por palabra clave.
        </Typography>
      </Box>

      <Box marginBottom={6} maxWidth="480px">
        <TextInput
          aria-label="Buscar en la guía"
          placeholder="Buscar… (ej: título, columnas, horario)"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
        />
      </Box>

      {visible.length === 0 ? (
        <Typography textColor="neutral600">
          Sin resultados para «{query}». Probá con otra palabra.
        </Typography>
      ) : (
        visible.map((section) => (
          <Box key={section.title} marginBottom={6}>
            <Box marginBottom={3}>
              <Typography variant="beta" tag="h2">
                {section.title}
              </Typography>
            </Box>
            {section.entries.map((entry) => (
              <EntryCard key={entry.title} entry={entry} forceOpen={q.length > 0} />
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}
