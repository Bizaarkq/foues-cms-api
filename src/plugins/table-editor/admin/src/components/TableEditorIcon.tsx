/**
 * Field icon shown by the Content-Type Builder next to the custom field.
 * Inline SVG on purpose: `@strapi/icons` is not resolvable from local plugin
 * code under pnpm's strict isolation (it is not aliased by Strapi's vite
 * config, unlike `@strapi/design-system`).
 */
export const TableEditorIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M3 9h18" />
    <path d="M3 14.5h18" />
    <path d="M9.5 9v11" />
    <path d="M15.5 9v11" />
  </svg>
);

export default TableEditorIcon;
