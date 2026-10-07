import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

function assertUuid(value: string, label: string) {
  if (!isUuid(value)) {
    throw new BadRequestException(`${label} نامعتبر است`);
  }
}

export type UploadFolder = 'articles' | 'games' | 'cpus';

const FOLDER_LABELS: Record<UploadFolder, string> = {
  articles: 'شناسه مقاله',
  games: 'شناسه بازی',
  cpus: 'شناسه پردازنده',
};

export function resolveUploadRelativePath(input: {
  folder: string | undefined;
  ownerId: string | undefined;
  scope: string | undefined;
  originalName: string;
}): string {
  const folder = (input.folder?.trim() || 'articles') as UploadFolder;
  if (folder !== 'articles' && folder !== 'games' && folder !== 'cpus') {
    throw new BadRequestException('پوشه آپلود نامعتبر است');
  }

  const ownerId = input.ownerId?.trim() ?? '';
  assertUuid(ownerId, FOLDER_LABELS[folder]);

  const filename = `${randomUUID()}-${input.originalName}`;

  if (folder === 'games') {
    const scope = input.scope?.trim() || 'gallery';
    if (scope !== 'cover' && scope !== 'gallery' && scope !== 'content') {
      throw new BadRequestException('بخش فایل بازی نامعتبر است');
    }
    return `gallery/games/${ownerId}/${scope}/${filename}`;
  }

  if (folder === 'cpus') {
    const scope = input.scope?.trim() || 'content';
    if (scope !== 'cover' && scope !== 'content') {
      throw new BadRequestException('بخش فایل پردازنده نامعتبر است');
    }
    return `gallery/cpus/${ownerId}/${scope}/${filename}`;
  }

  const scope = input.scope?.trim() || 'cover';
  if (scope !== 'cover' && scope !== 'content') {
    throw new BadRequestException('بخش فایل مقاله نامعتبر است');
  }
  return `gallery/articles/${ownerId}/${scope}/${filename}`;
}
