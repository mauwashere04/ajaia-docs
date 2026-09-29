import { jsonError, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { importDocx } from '@/lib/docx-import';
import { createDocument, createDocumentFromFile, getDb } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError('Choose a .txt, .md, or .docx file.', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonError('Choose a .txt, .md, or .docx file.', 400);

  if (file.name.toLowerCase().endsWith('.docx')) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const imported = await importDocx(file.name, bytes);
    if (!imported.ok) return storeErrorResponse(imported);
    const created = createDocument(getDb(), user.id, { title: imported.title, content: imported.content });
    if (!created.ok) return storeErrorResponse(created);
    return Response.json({ document: created.document }, { status: 201 });
  }

  const text = await file.text();
  const result = createDocumentFromFile(getDb(), user.id, file.name, text, file.size);
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document }, { status: 201 });
}
