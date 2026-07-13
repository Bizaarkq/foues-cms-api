import type { ComponentType } from 'react';

import type { StrapiApp } from '@strapi/strapi/admin';

import { TableEditorIcon } from './components/TableEditorIcon';
import { PLUGIN_ID } from './pluginId';

export default {
  register(app: StrapiApp) {
    app.customFields.register({
      name: 'table',
      pluginId: PLUGIN_ID,
      type: 'json',
      icon: TableEditorIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.table.label`,
        defaultMessage: 'Tabla',
      },
      intlDescription: {
        id: `${PLUGIN_ID}.table.description`,
        defaultMessage: 'Grilla editable con importación desde CSV/Excel',
      },
      components: {
        Input: async () =>
          import('./components/TableEditorInput').then((module) => ({
            // The registration API expects a prop-less ComponentType; the
            // content manager injects name/label/etc. at runtime.
            default: module.default as unknown as ComponentType,
          })),
      },
      options: {
        advanced: [
          {
            sectionTitle: {
              id: 'global.settings',
              defaultMessage: 'Settings',
            },
            items: [
              {
                name: 'required',
                type: 'checkbox',
                intlLabel: {
                  id: `${PLUGIN_ID}.options.required`,
                  defaultMessage: 'Campo requerido',
                },
                description: {
                  id: `${PLUGIN_ID}.options.required.description`,
                  defaultMessage:
                    'No se podrá guardar una entrada si este campo está vacío',
                },
              },
            ],
          },
        ],
      },
    });
  },
};
