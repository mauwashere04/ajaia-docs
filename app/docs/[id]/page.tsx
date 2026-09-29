import { redirect } from 'next/navigation';
import { DocumentScreen } from '@/components/DocumentScreen';
import { hasSessionCookie } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await hasSessionCookie())) redirect('/login');
  const { id } = await params;
  return <DocumentScreen documentId={id} />;
}
