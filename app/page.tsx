import { redirect } from 'next/navigation';
import { hasSessionCookie } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  redirect((await hasSessionCookie()) ? '/docs' : '/login');
}
