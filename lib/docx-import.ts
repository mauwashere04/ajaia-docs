import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import mammoth from 'mammoth';
import { htmlToDoc } from './html-to-doc';
import { titleFromFilename } from './markdown';
import type { DocContent, StoreError } from './types';
import { uploadsDirectory } from './uploads-dir';

const DOCX_LIMIT = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function importDocx(
  filename: string,
  bytes: Buffer,
): Promise<{ ok: true; title: string; content: DocContent } | StoreError> {
  if (!filename.toLowerCase().endsWith('.docx')) {
    return { ok: false, status: 400, code: 'invalid', error: 'Upload a .txt, .md, or .docx file.' };
  }
  if (bytes.byteLength > DOCX_LIMIT) {
    return { ok: false, status: 400, code: 'invalid', error: 'Word files must be 5 MB or smaller.' };
  }

  try {
    const result = await mammoth.convertToHtml(
      { buffer: bytes },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const extension = IMAGE_TYPES[image.contentType];
          if (!extension) return { src: '' };
          const data = Buffer.from(await image.read());
          const name = `${randomUUID()}.${extension}`;
          const directory = uploadsDirectory();
          await mkdir(directory, { recursive: true });
          await writeFile(join(directory, name), data);
          return { src: `/api/media/${name}` };
        }),
      },
    );
    return { ok: true, title: titleFromFilename(filename), content: htmlToDoc(result.value) };
  } catch {
    return { ok: false, status: 400, code: 'invalid', error: 'That Word file could not be read.' };
  }
}
