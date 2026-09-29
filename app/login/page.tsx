import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { hasSessionCookie } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await hasSessionCookie()) redirect('/docs');
  return <LoginForm />;
}
