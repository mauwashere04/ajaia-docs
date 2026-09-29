import { jsonError, readJson, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { createDocument, getDb, listDocuments } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  return Response.json(listDocuments(getDb(), user.id));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);

  const body = await readJson(request);
  const title =
    body && typeof body === 'object' && 'title' in body && typeof body.title === 'string'
      ? body.title
      : 'Untitled';
  const result = createDocument(getDb(), user.id, { title });
  if (!result.ok) return storeErrorResponse(result);
  return Response.json({ document: result.document }, { status: 201 });
}
