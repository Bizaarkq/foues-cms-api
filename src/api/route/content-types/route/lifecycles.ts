/**
 * route lifecycles — path validation at the source.
 *
 * The frontend app router owns some first segments: /revista/{slug} (magazine
 * editions), /articulos/{slug} (article detail), /login, /api/* and /_next/*.
 * A CMS route starting with one of them would be shadowed by the static
 * Next.js route and never render. "pagina" is reserved in ANY position:
 * `{path}/pagina/{n}` is the virtual pagination child of `{path}`, so a real
 * route with that segment would collide with pagination URLs.
 */

import { errors } from '@strapi/utils';

const { ValidationError } = errors;

const RESERVED_FIRST_SEGMENTS = [
  'revista',
  'magazine',
  'articulos',
  'login',
  'api',
  '_next',
];

const RESERVED_ANY_SEGMENT = 'pagina';

function validatePath(data: Record<string, unknown>): void {
  // Partial updates may omit the path entirely — nothing to check.
  const path = data.path;
  if (typeof path !== 'string' || path.length === 0) return;

  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s) => s.toLowerCase());

  // "/" (home) has no segments.
  if (segments.length === 0) return;

  if (RESERVED_FIRST_SEGMENTS.includes(segments[0])) {
    throw new ValidationError(
      `La dirección no puede empezar con "/${segments[0]}": es un segmento reservado del sistema (${RESERVED_FIRST_SEGMENTS.map((s) => '/' + s).join(', ')}).`
    );
  }

  if (segments.includes(RESERVED_ANY_SEGMENT)) {
    throw new ValidationError(
      'La dirección no puede contener el segmento "pagina": está reservado para las URLs de paginación del sitio (…/pagina/2, …/pagina/3).'
    );
  }
}

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    if (event.params.data.active == null) {
      event.params.data.active = true;
    }
    validatePath(event.params.data);
  },

  async beforeUpdate(event: { params: { data: Record<string, unknown> } }) {
    validatePath(event.params.data);
  },
};
