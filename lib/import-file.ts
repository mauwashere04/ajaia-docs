import { markdownToDoc, textToDoc, titleFromFilename } from './markdown';
import type { DocContent, StoreError } from './types';

const FILE_LIMIT = 512 * 1024;

export function importFile(
  filename: string,
  text: string,
  size = Buffer.byteLength(text),
): { ok: true; title: string; content: DocContent } | StoreError {
  if (!filename.trim()) {
    return { ok: false, status: 400, code: 'invalid', error: 'Choose a .txt, .md, or .docx file.' };
  }
  if (size > FILE_LIMIT || Buffer.byteLength(text) > FILE_LIMIT) {
    return { ok: false, status: 400, code: 'invalid', error: 'File must be 512 KB or smaller.' };
  }

  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) {
    return { ok: true, title: titleFromFilename(filename), content: markdownToDoc(text) };
  }
  if (lower.endsWith('.txt')) {
    return { ok: true, title: titleFromFilename(filename), content: textToDoc(text) };
  }
  return {
    ok: false,
    status: 400,
    code: 'invalid',
    error: 'Upload a .txt, .md, or .docx file. Other formats are not imported.',
  };
}
