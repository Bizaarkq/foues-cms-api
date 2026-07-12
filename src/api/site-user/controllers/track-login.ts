import { randomBytes } from 'node:crypto';
import type { Core } from '@strapi/strapi';

type AttrMeta = { columnName: string };
type SiteUserMeta = {
  tableName: string;
  attributes: Record<string, AttrMeta> & {
    role: AttrMeta & {
      joinTable?: {
        name: string;
        joinColumn: { name: string };
        inverseJoinColumn: { name: string };
      };
    };
  };
};

// Suficiente para rechazar basura; la autoridad del dominio es el signIn
// callback del frontend (solo @ues.edu.sv llega hasta acá).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * POST /site-users/track-login — registra un inicio de sesión.
   *
   * Upsert atómico por email único (INSERT … ON DUPLICATE KEY UPDATE, el
   * patrón anti-carreras del issue #8): dos logins concurrentes del mismo
   * correo jamás crean filas duplicadas. Usuario nuevo recibe el rol con
   * is_default (fallback: key 'estudiante'). Responde el rol VIGENTE del
   * usuario para que el frontend lo guarde en la sesión.
   */
  async trackLogin(ctx: any) {
    const body = ctx.request.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 255) : '';

    if (!EMAIL_RE.test(email)) {
      return ctx.badRequest('email is required and must be a valid address');
    }

    // Rol default para usuarios nuevos (gobernado desde el admin)
    const defaultRole = ((await strapi.db.query('api::user-role.user-role').findOne({
      where: { is_default: true },
    })) ??
      (await strapi.db.query('api::user-role.user-role').findOne({
        where: { key: 'estudiante' },
      }))) as { id: number } | null;

    const meta = strapi.db.metadata.get('api::site-user.site-user') as unknown as SiteUserMeta;
    const col = (attr: string) => meta.attributes[attr].columnName;

    const joinTable = meta.attributes.role.joinTable;
    const linkTable = joinTable?.name ?? 'site_users_role_lnk';
    const linkUserCol = joinTable?.joinColumn.name ?? 'site_user_id';
    const linkRoleCol = joinTable?.inverseJoinColumn.name ?? 'user_role_id';

    // documentId aleatorio para filas nuevas (el ancla de unicidad es email)
    const documentId = `su${randomBytes(11).toString('hex')}`;

    const knex = strapi.db.connection as any;

    await knex.transaction(async (trx: any) => {
      const [result] = await trx.raw(
        `INSERT INTO \`${meta.tableName}\`
           (document_id, \`${col('email')}\`, \`${col('name')}\`, \`${col('last_login')}\`, \`${col('login_count')}\`,
            created_at, updated_at, published_at)
         VALUES (?, ?, ?, NOW(6), 1, NOW(6), NOW(6), NOW(6))
         AS incoming
         ON DUPLICATE KEY UPDATE
           \`${col('name')}\` = incoming.\`${col('name')}\`,
           \`${col('last_login')}\` = incoming.\`${col('last_login')}\`,
           \`${col('login_count')}\` = \`${meta.tableName}\`.\`${col('login_count')}\` + 1,
           updated_at = incoming.updated_at`,
        [documentId, email, name]
      );

      // Fila nueva → asignar el rol default (el link vive en su propia tabla)
      if (result.affectedRows === 1 && defaultRole) {
        await trx(linkTable).insert({
          [linkUserCol]: result.insertId,
          [linkRoleCol]: defaultRole.id,
        });
      }
    });

    // Rol VIGENTE (puede haber sido cambiado por un admin) para la sesión
    const user = (await strapi.db.query('api::site-user.site-user').findOne({
      where: { email },
      populate: ['role'],
    })) as { role: { key: string | null; name: string } | null } | null;

    ctx.body = {
      ok: true,
      role: user?.role ? { key: user.role.key, name: user.role.name } : null,
    };
  },
});
