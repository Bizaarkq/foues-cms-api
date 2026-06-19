import type { StrapiApp } from '@strapi/strapi/admin';
import { FormSubmissionsPanel } from './extensions/FormSubmissionsPanel';
import { MagazineStatsPanel } from './extensions/MagazineStatsPanel';

export default {
  config: {
    locales: [
      // 'ar',
      // 'fr',
      // 'cs',
      // 'de',
      // 'dk',
      // 'es',
      // 'he',
      // 'id',
      // 'it',
      // 'ja',
      // 'ko',
      // 'ms',
      // 'nl',
      // 'no',
      // 'pl',
      // 'pt-BR',
      // 'pt',
      // 'ru',
      // 'sk',
      // 'sv',
      // 'th',
      // 'tr',
      // 'uk',
      // 'vi',
      // 'zh-Hans',
      // 'zh',
    ],
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
