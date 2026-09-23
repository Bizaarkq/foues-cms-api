import type { Core } from '@strapi/strapi';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Shared by the page-seeding migrations (002, 013). Seeds reference media as
// "@media:<file>" and express two-column sections inline through `groups`;
// this helper turns both into what the Document Service expects.

const MEDIA_PREFIX = '@media:';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

type SeedBlock = Record<string, unknown>;

type SeedGroup = {
  name: string;
  group_columns: number;
  blocks: SeedBlock[];
};

// file name -> upload file id, shared across the pages of one migration run.
export type MediaCache = Map<string, number>;

export function createMediaCache(): MediaCache {
  return new Map();
}

// Resolved from the app root at runtime: the compiled dist/ does not contain
// the images, so never resolve relative to __dirname.
export function getMediaDir(strapi: Core.Strapi): string {
  return path.join(strapi.dirs.app.root, 'src', 'seeds', 'media');
}

// Read with fs (not import) so the manifest always comes from the same
// directory as the images.
let manifest: Record<string, string> | null = null;

async function getAlternativeText(strapi: Core.Strapi, fileName: string): Promise<string> {
  if (!manifest) {
    const manifestPath = path.join(getMediaDir(strapi), 'manifest.json');
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  }

  const alternativeText = manifest[fileName];
  if (!alternativeText) {
    throw new Error(`Seed media has no manifest entry: ${fileName}`);
  }
  return alternativeText;
}

async function resolveMedia(
  strapi: Core.Strapi,
  fileName: string,
  cache: MediaCache
): Promise<number> {
  const cached = cache.get(fileName);
  if (cached) return cached;

  // Dedupe by name so re-running a seed never uploads the same image twice.
  const existing = await strapi.db.query('plugin::upload.file').findOne({
    where: { name: fileName },
  });
  if (existing) {
    cache.set(fileName, existing.id);
    return existing.id;
  }

  const sourcePath = path.join(getMediaDir(strapi), fileName);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Seed media not found: ${fileName}`);
  }

  const alternativeText = await getAlternativeText(strapi, fileName);
  const mimetype = MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()];
  if (!mimetype) {
    throw new Error(`Seed media has an unsupported extension: ${fileName}`);
  }

  // Upload from a temporary copy so the pipeline can never move or delete the
  // committed source file.
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'seed-media-'));
  try {
    const filepath = path.join(tmpDir, fileName);
    await fs.promises.copyFile(sourcePath, filepath);
    const stat = await fs.promises.stat(filepath);

    const uploadService = strapi.plugin('upload').service('upload') as any;
    const result: any[] = await uploadService.upload({
      data: {
        fileInfo: {
          name: fileName,
          alternativeText,
          caption: '',
        },
      },
      files: [
        {
          filepath,
          originalFilename: fileName,
          mimetype,
          size: stat.size,
          newFilename: fileName,
          hashAlgorithm: false,
          hash: null,
          toJSON: () => ({}),
        },
      ],
    });

    const uploaded = Array.isArray(result) ? result[0] : result;
    if (!uploaded?.id) {
      throw new Error(`Seed media upload returned no file: ${fileName}`);
    }

    strapi.log.info(`[data-migrations] Media "${fileName}" uploaded.`);
    cache.set(fileName, uploaded.id);
    return uploaded.id;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

function isMediaReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(MEDIA_PREFIX);
}

async function resolveBlock(
  strapi: Core.Strapi,
  block: SeedBlock,
  cache: MediaCache
): Promise<SeedBlock> {
  const resolved: SeedBlock = {};

  for (const [key, value] of Object.entries(block)) {
    if (isMediaReference(value)) {
      resolved[key] = await resolveMedia(strapi, value.slice(MEDIA_PREFIX.length), cache);
    } else if (Array.isArray(value) && value.length > 0 && value.every(isMediaReference)) {
      const ids: number[] = [];
      for (const reference of value) {
        ids.push(await resolveMedia(strapi, reference.slice(MEDIA_PREFIX.length), cache));
      }
      resolved[key] = ids;
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// Creates one published block-group per inline group and swaps `groups` for
// the `children` relation. Sections cannot nest, so groups are not walked for
// further sections.
async function resolveSection(
  strapi: Core.Strapi,
  block: SeedBlock,
  cache: MediaCache
): Promise<SeedBlock> {
  const { groups, ...section } = block as SeedBlock & { groups: SeedGroup[] };
  const documentIds: { documentId: string }[] = [];

  for (const group of groups) {
    const blocks: SeedBlock[] = [];
    for (const child of group.blocks) {
      blocks.push(await resolveBlock(strapi, child, cache));
    }

    const created = await strapi.documents('api::block-group.block-group').create({
      data: {
        name: group.name,
        group_columns: group.group_columns,
        blocks,
      } as never,
      status: 'published',
    });
    documentIds.push({ documentId: created.documentId });
  }

  return { ...section, children: { connect: documentIds } };
}

export async function resolvePageContent(
  strapi: Core.Strapi,
  content: SeedBlock[],
  mediaCache: MediaCache
): Promise<SeedBlock[]> {
  const resolved: SeedBlock[] = [];

  for (const block of content) {
    if (block.__component === 'blocks.section' && Array.isArray(block.groups)) {
      resolved.push(await resolveSection(strapi, block, mediaCache));
    } else {
      resolved.push(await resolveBlock(strapi, block, mediaCache));
    }
  }

  return resolved;
}
