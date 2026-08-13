import { createContext, useContext, type ReactNode } from 'react';
import { useRtcCall, type UseRtcCallResult } from './application/useRtcCall';

/**
 * DialerProvider (plan Combo lot-11.3 §2.1) — UNE SEULE instance de
 * useRtcCall montée au niveau de CallManagerApp, exposée par contexte.
 * C'est ce qui garantit « un appel à la fois » côté UI : la machine à états
 * vit ici, pas dans chaque vue. (F7 audit lot-11.7 : l'ancienne référence à
 * l'index 044 « 1 appel actif par user » est caduque — la migration 045 l'a
 * retiré pour le power dialing 3 lignes. Les bornes côté serveur sont
 * désormais le budget par composition + le parallelism de campagne.)
 *
 * Contraintes :
 * - click-to-call humain, jamais d'auto-next (ARCEP §7.1.3)
 * - la page ?view=dialer reste le panneau ops/diagnostic (DialerView),
 *   le provider alimente aussi la CallBar et le bouton du Runner
 */
const DialerContext = createContext<UseRtcCallResult | null>(null);

export function DialerProvider({
  token,
  dryRun,
  children,
}: {
  token: string;
  dryRun: boolean;
  children: ReactNode;
}) {
  const rtc = useRtcCall({ token, dryRun });

  return <DialerContext.Provider value={rtc}>{children}</DialerContext.Provider>;
}

export function useDialer(): UseRtcCallResult {
  const ctx = useContext(DialerContext);
  if (!ctx) {
    throw new Error('useDialer doit être utilisé dans <DialerProvider>.');
  }
  return ctx;
}
