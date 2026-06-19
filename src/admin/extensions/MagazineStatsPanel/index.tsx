import { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Loader,
  Modal,
  Typography,
} from '@strapi/design-system';
import {
  unstable_useContentManagerContext,
  unstable_useDocument,
} from '@strapi/strapi/admin';

import { ErrorBoundary } from './ErrorBoundary';
import { StatsTable } from './StatsTable';
import { downloadStatsCsv } from './csvExport';
import { useMagazineStats } from './useMagazineStats';

const ISSUE_UID = 'api::magazine-issue.magazine-issue';

function MagazineStatsPanelInner() {
  const { slug, id, collectionType } = unstable_useContentManagerContext();

  if (slug !== ISSUE_UID) return null;
  if (!id) return null;

  return <PanelContent issueDocumentId={id} slug={slug} collectionType={collectionType} />;
}

interface PanelContentProps {
  issueDocumentId: string;
  slug: string;
  collectionType: string;
}

function PanelContent({ issueDocumentId, slug, collectionType }: PanelContentProps) {
  const [open, setOpen] = useState(false);

  const { document } = unstable_useDocument({ collectionType, model: slug, documentId: issueDocumentId });
  const issueTitle =
    (document as unknown as { title?: string } | undefined)?.title ?? 'revista';

  const { state, refetch } = useMagazineStats({
    issueDocumentId,
    enabled: open,
  });

  const statCount = state.kind === 'success' ? ` (${state.stats.length} días)` : '';

  return (
    <Box paddingTop={2}>
      <Button variant="secondary" onClick={() => setOpen(true)} size="S" fullWidth>
        Estadísticas de lectura{statCount}
      </Button>

      {open && (
        <Modal.Root open={open} onOpenChange={(isOpen: boolean) => !isOpen && setOpen(false)}>
          <Modal.Content>
            <Modal.Header closeLabel="Cerrar">
              <Modal.Title>Estadísticas de Revista — {issueTitle}</Modal.Title>
            </Modal.Header>

            <Modal.Body>
              {state.kind === 'loading' && (
                <Flex padding={8} justifyContent="center">
                  <Loader>Cargando estadísticas…</Loader>
                </Flex>
              )}

              {state.kind === 'error' && (
                <Box padding={4}>
                  <Typography variant="omega" textColor="danger600">
                    {state.message}
                  </Typography>
                </Box>
              )}

              {state.kind === 'idle' && (
                <Box padding={4}>
                  <Typography variant="omega" textColor="neutral600">
                    Abriendo…
                  </Typography>
                </Box>
              )}

              {state.kind === 'success' && (
                <StatsTable stats={state.stats} />
              )}
            </Modal.Body>

            <Modal.Footer>
              <Flex gap={2} justifyContent="flex-end" style={{ width: '100%' }}>
                {state.kind === 'error' && (
                  <Button variant="secondary" onClick={refetch} size="S">
                    Reintentar
                  </Button>
                )}
                {state.kind === 'success' && (
                  <Button
                    variant="secondary"
                    onClick={() => downloadStatsCsv(state.stats, issueTitle)}
                    size="S"
                    disabled={state.stats.length === 0}
                  >
                    Descargar CSV
                  </Button>
                )}
                <Button variant="tertiary" onClick={() => setOpen(false)} size="S">
                  Cerrar
                </Button>
              </Flex>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      )}
    </Box>
  );
}

export function MagazineStatsPanel() {
  return (
    <ErrorBoundary>
      <MagazineStatsPanelInner />
    </ErrorBoundary>
  );
}
