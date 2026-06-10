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
import { SubmissionsTable } from './SubmissionsTable';
import { downloadCsv } from './csvExport';
import { useFormSubmissions, type FormFieldDef } from './useFormSubmissions';

// Only inject for this content-type; return null for everything else.
const FORM_UID = 'api::form.form';

function FormSubmissionsPanelInner() {
  const { slug, id, collectionType } = unstable_useContentManagerContext();

  if (slug !== FORM_UID) return null;

  // id is undefined when creating a new entry — nothing to show yet.
  if (!id) return null;

  return <PanelContent formDocumentId={id} slug={slug} collectionType={collectionType} />;
}

interface PanelContentProps {
  formDocumentId: string;
  slug: string;
  collectionType: string;
}

function PanelContent({ formDocumentId, slug, collectionType }: PanelContentProps) {
  const [open, setOpen] = useState(false);

  // Fetch the document to read its fields array (the repeatable form-field component).
  // unstable_useDocument caches via RTK-Query — no extra network cost.
  const { document } = unstable_useDocument({ collectionType, model: slug, documentId: formDocumentId });

  // Extract the fields array; the Strapi document typing uses AnyData (unknown shape),
  // so we cast via unknown to our known type.
  const fieldsFromDocument = (document as unknown as { fields?: FormFieldDef[] } | undefined)
    ?.fields ?? [];

  const formTitle =
    (document as unknown as { title?: string } | undefined)?.title ?? 'formulario';

  const { state, refetch } = useFormSubmissions({
    formDocumentId,
    fieldsFromDocument,
    enabled: open,
  });

  function handleOpen() {
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  const submissionCount =
    state.kind === 'success' ? ` (${state.submissions.length})` : '';

  return (
    <Box paddingTop={2}>
      <Button variant="secondary" onClick={handleOpen} size="S" fullWidth>
        Ver envíos{submissionCount}
      </Button>

      {open && (
        <Modal.Root open={open} onOpenChange={(isOpen: boolean) => !isOpen && handleClose()}>
          <Modal.Content>
            <Modal.Header closeLabel="Cerrar">
              <Modal.Title>
                Envíos — {formTitle}
              </Modal.Title>
            </Modal.Header>

            <Modal.Body>
              {state.kind === 'loading' && (
                <Flex padding={8} justifyContent="center">
                  <Loader>Cargando envíos…</Loader>
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
                <SubmissionsTable
                  submissions={state.submissions}
                  fields={state.fields}
                  truncated={state.truncated}
                />
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
                    onClick={() => downloadCsv(state.submissions, state.fields, formTitle)}
                    size="S"
                    disabled={state.submissions.length === 0}
                  >
                    Descargar CSV
                  </Button>
                )}
                <Button variant="tertiary" onClick={handleClose} size="S">
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

export function FormSubmissionsPanel() {
  return (
    <ErrorBoundary>
      <FormSubmissionsPanelInner />
    </ErrorBoundary>
  );
}
