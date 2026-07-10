/**
 * form lifecycles — content validation at the source.
 *
 * select/radio fields without options crash nothing in the frontend anymore
 * (it sanitizes them away), but the field silently disappearing from a public
 * form is still a content bug. Reject the save here so the editor gets a
 * clear message instead.
 */

import { errors } from '@strapi/utils';

const { ValidationError } = errors;

interface FormFieldData {
  name?: string;
  field_type?: string;
  options?: string | null;
}

function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateFields(data: Record<string, unknown>): void {
  const fields = data.fields;
  // Partial updates may omit the component array entirely — nothing to check.
  if (!Array.isArray(fields)) return;

  for (const field of fields as FormFieldData[]) {
    if (typeof field?.field_type !== 'string') continue;

    const needsOptions = field.field_type === 'select' || field.field_type === 'radio';
    if (needsOptions && parseOptions(field.options).length === 0) {
      throw new ValidationError(
        `El campo "${field.name ?? '(sin nombre)'}" es de tipo ${field.field_type} y necesita al menos una opción (una por línea en el campo Opciones).`
      );
    }
  }
}

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    validateFields(event.params.data);
  },

  async beforeUpdate(event: { params: { data: Record<string, unknown> } }) {
    validateFields(event.params.data);
  },
};
