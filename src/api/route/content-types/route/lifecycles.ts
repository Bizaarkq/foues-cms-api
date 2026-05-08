// @strapi/utils is a transitive dep of @strapi/strapi — use require to bypass TS module resolution
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { errors } = require('@strapi/utils') as {
  errors: { ValidationError: new (message: string) => Error };
};

type RouteType = 'page' | 'section' | 'header';

interface RouteData {
  type?: RouteType;
  page?: unknown;
  parent?: unknown;
}

function validate(data: RouteData): void {
  const { type, page, parent } = data;

  // Rule 1: section type must have a page relation
  if (type === 'section' && (page === null || page === undefined)) {
    throw new errors.ValidationError(
      "Routes with type='section' must have a page relation set."
    );
  }

  // Rule 2: header type must NOT have a page relation
  if (type === 'header' && page != null) {
    throw new errors.ValidationError(
      "Routes with type='header' cannot have a page relation."
    );
  }

}

export default {
  async beforeCreate(event: { params: { data: RouteData } }) {
    validate(event.params.data);
  },

  async beforeUpdate(event: {
    params: { where: { documentId: string }; data: RouteData };
  }) {
    // Fetch the current record to merge with incoming data
    const current = await strapi
      .documents('api::route.route')
      .findOne({
        documentId: event.params.where.documentId,
        populate: ['page', 'parent'],
      });

    // Merge: incoming data overrides current values
    const merged: RouteData = {
      type: event.params.data.type ?? (current as RouteData | null)?.type,
      page:
        'page' in event.params.data
          ? event.params.data.page
          : (current as RouteData | null)?.page,
      parent:
        'parent' in event.params.data
          ? event.params.data.parent
          : (current as RouteData | null)?.parent,
    };

    validate(merged);
  },
};
