import { redirect } from 'next/navigation';
import { Library } from '@/components/Library';
import { hasSessionCookie } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function DocsPage() {
  if (!(await hasSessionCookie())) redirect('/login');
  return <Library />;
}
