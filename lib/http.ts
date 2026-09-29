import type { StoreError } from './types';

export function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function storeErrorResponse(result: StoreError) {
  // Someone who cannot read the document gets the same response as a missing id.
  if (result.code === 'forbidden') return jsonError('Document not found.', 404);
  return jsonError(result.error, result.status);
}
