import type { StrapiApp } from '@strapi/strapi/admin';
import { FormSubmissionsPanel } from './extensions/FormSubmissionsPanel';
import { MagazineStatsPanel } from './extensions/MagazineStatsPanel';

// SVG inline: @strapi/icons no es resolvible desde el admin del proyecto
// (pnpm estricto — no es dependencia directa y Vite no lo alias-ea).
const BookIcon = () => (
  <svg width="1rem" height="1rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);

export default {
  config: {
    // Editores es-SV: el admin ofrece español (cada usuario lo elige en su perfil).
    locales: ['es'],
  },
  register(app: StrapiApp) {
    app.addMenuLink({
      to: '/editor-guide',
      icon: BookIcon,
      intlLabel: {
        id: 'editor-guide.link',
        defaultMessage: 'Guía del editor',
      },
      Component: async () => {
        const { EditorGuidePage } = await import('./extensions/EditorGuide');
        return { default: EditorGuidePage };
      },
    });
  },
  bootstrap(app: StrapiApp) {
    // RBAC note: roles that need to use this panel must be granted `find` and
    // `findOne` permissions for `api::form-submission.form-submission` via
    // Strapi Settings → Roles. Without those permissions the API returns 403
    // and the dialog shows the error state.
    app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
      name: 'FormSubmissionsPanel',
      Component: FormSubmissionsPanel,
    });
    app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
      name: 'MagazineStatsPanel',
      Component: MagazineStatsPanel,
    });
  },
};
