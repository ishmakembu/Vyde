import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Providers } from './providers';
import { AppShell } from './AppShell';
import { PWAInstallPrompt } from '@/components/ui/PWAInstallPrompt';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  return (
    <Providers session={session}>
      <AppShell username={session?.user?.username || 'User'}>
        {children}
      </AppShell>
      <PWAInstallPrompt />
    </Providers>
  );
}