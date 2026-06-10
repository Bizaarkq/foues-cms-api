import { useEffect, useRef, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

export interface FormFieldDef {
  name: string;
  label: string;
}

export interface Submission {
  documentId: string;
  submitted_at: string | null;
  ip_address: string | null;
  form_title: string | null;
  data: unknown;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; submissions: Submission[]; fields: FormFieldDef[]; truncated: boolean };

interface UseFormSubmissionsOptions {
  formDocumentId: string;
  /** Fields already present in the content-manager document context (preferred source). */
  fieldsFromDocument: FormFieldDef[] | undefined | null;
  /** Lazy gate — fetch only starts when this is true. */
  enabled: boolean;
}

interface UseFormSubmissionsResult {
  state: State;
  refetch: () => void;
}

const FORM_SUBMISSION_UID = 'api::form-submission.form-submission';
const FORM_UID = 'api::form.form';
const BASE_CM = '/content-manager/collection-types';

function deriveFieldsFromData(submissions: Submission[]): FormFieldDef[] {
  // Last-resort fallback: infer column names from the keys of the first submission's data.
  // Excludes known fixed columns that are top-level fields, not submission data keys.
  if (submissions.length === 0) return [];
  const first = submissions[0].data;
  if (first === null || typeof first !== 'object' || Array.isArray(first)) return [];
  return Object.keys(first as Record<string, unknown>).map((k) => ({ name: k, label: k }));
}

export function useFormSubmissions({
  formDocumentId,
  fieldsFromDocument,
  enabled,
}: UseFormSubmissionsOptions): UseFormSubmissionsResult {
  const [state, setState] = useState<State>({ kind: 'idle' });
  // Stable ref lets us trigger a manual refetch by bumping a counter.
  const [fetchTick, setFetchTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const { get } = useFetchClient();

  useEffect(() => {
    if (!enabled) return;

    // Cancel any in-flight request before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ kind: 'loading' });

    async function run() {
      try {
        // ── Step 1: resolve field definitions ──────────────────────────────
        let fields: FormFieldDef[] = [];

        const normalised = (fieldsFromDocument ?? []).filter((f) => f.name && f.label);
        if (normalised.length > 0) {
          fields = normalised;
        } else {
          // Attempt to fetch the form document to read its fields array.
          // RBAC: the admin user must have findOne on api::form.form. If not, we catch
          // and fall through to the data-key derivation below.
          try {
            // CM findOne response shape: { data: Document, meta: {} }
            // useFetchClient.get<T> wraps in { data: T }, so res.data is the body.
            const formRes = await get<{ data: { fields: FormFieldDef[] }; meta: unknown }>(
              `${BASE_CM}/${FORM_UID}/${formDocumentId}`,
              { signal: controller.signal },
            );
            const fetched = (formRes.data?.data?.fields ?? []).filter((f) => f.name && f.label);
            if (fetched.length > 0) fields = fetched;
          } catch (formErr) {
            if (controller.signal.aborted) return;
            // Non-fatal — fall through; fields stays [] and we derive from data below.
            console.warn('[FormSubmissionsPanel] Could not fetch form fields:', formErr);
          }
        }

        // ── Step 2: fetch submissions ───────────────────────────────────────
        // CM find response shape: { results: [], pagination: {} }
        // useFetchClient.get<T> wraps in { data: T }, so res.data is the body.
        const submissionsRes = await get<{
          results: Submission[];
          pagination: { total: number; pageSize: number; page: number; pageCount: number };
        }>(`${BASE_CM}/${FORM_SUBMISSION_UID}`, {
          params: {
            'filters[form_id][$eq]': formDocumentId,
            sort: 'submitted_at:desc',
            'pagination[page]': 1,
            'pagination[pageSize]': 200,
          },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const results = submissionsRes.data?.results ?? [];
        const total = submissionsRes.data?.pagination?.total ?? 0;
        // Guard against absent pagination object: also flag at the hard cap.
        const truncated = total > results.length || results.length >= 200;

        // ── Step 3: last-resort field derivation from data ─────────────────
        if (fields.length === 0) {
          fields = deriveFieldsFromData(results);
        }

        setState({ kind: 'success', submissions: results, fields, truncated });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Error al cargar los envíos.';
        setState({ kind: 'error', message });
      }
    }

    run();

    return () => {
      controller.abort();
    };
    // fieldsFromDocument is intentionally excluded from deps: unstable_useDocument resolves
    // async so the first run always sees [], triggering the fallback form fetch. Adding it
    // as a dep would cause a second fetch when the document populates — the fallback already
    // returns the correct fields, so the extra round-trip buys nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, formDocumentId, fetchTick]);

  function refetch() {
    setFetchTick((t) => t + 1);
  }

  return { state, refetch };
}
