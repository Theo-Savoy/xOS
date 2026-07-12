import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { AppRole } from '../../os/registry';
import { CleanerShell } from './shell/CleanerShell';
import './cleaner.css';

type CleanerAppProps = {
  params?: Record<string, string>;
};

type CleanerSession = {
  accessToken: string;
  role: AppRole;
};

function isAppRole(value: unknown): value is AppRole {
  return value === 'admin' || value === 'manager' || value === 'commercial';
}

type ProfileClient = {
  from?: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data?: { role?: unknown } | null }>;
      };
    };
  };
};

export default function CleanerApp({ params }: CleanerAppProps) {
  const [session, setSession] = useState<CleanerSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth
      .getSession()
      .then(async ({ data: { session: currentSession } }) => {
        const accessToken = currentSession?.access_token;
        if (!accessToken || cancelled) return;

        const metadata = currentSession.user?.user_metadata as
          Record<string, unknown> | undefined;
        let role: AppRole = isAppRole(metadata?.role)
          ? metadata.role
          : 'commercial';
        const profileClient = supabase as unknown as ProfileClient;
        if (
          !isAppRole(metadata?.role) &&
          currentSession.user?.email &&
          profileClient.from
        ) {
          try {
            const { data } = await profileClient
              .from('profiles')
              .select('role')
              .eq('email', currentSession.user.email)
              .maybeSingle();
            if (isAppRole(data?.role)) role = data.role;
          } catch {
            // The desktop already guards this lookup; commercial is the safe shell default.
          }
        }
        if (cancelled) return;
        setSession({ accessToken, role });
      })
      .catch(() => {
        if (!cancelled) setSession({ accessToken: '', role: 'commercial' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) {
    return (
      <div
        className="cleaner-app cleaner-app--booting"
        role="status"
        aria-busy="true"
      >
        Ouverture du Labo…
      </div>
    );
  }

  return (
    <CleanerShell
      accessToken={session.accessToken}
      role={session.role}
      params={params}
    />
  );
}
