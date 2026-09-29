import { jsonError, storeErrorResponse } from '@/lib/http';
import { currentUser } from '@/lib/current-user';
import { docToMarkdown } from '@/lib/markdown';
import { getDb, getDocumentForUser } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return jsonError('Sign in to continue.', 401);
  const { id } = await context.params;
  const result = getDocumentForUser(getDb(), user.id, id);
  if (!result.ok) return storeErrorResponse(result);

  const filename = `${result.document.title.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'document'}.md`;
  return new Response(docToMarkdown(result.document.content), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
