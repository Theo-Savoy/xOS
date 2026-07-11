/** Icônes dock/launcher — formes simples, plein cadre, lisibles à 48px. */

import type { ReactNode } from "react";

type IconProps = { className?: string };

function IconShell({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="100%" height="100%" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

/** CRM Cleaner — losange net */
export function CleanerIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path fill="currentColor" d="M24 5 43 24 24 43 5 24 24 5Z" />
      <path fill="currentColor" d="M24 16 32 24 24 32 16 24 24 16Z" opacity=".28" />
    </IconShell>
  );
}

/** Call Manager — combiné */
export function CallsIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path
        fill="currentColor"
        d="M15.8 9.5c1.2-1.2 3.1-1.2 4.3 0l2.9 2.9c1 1 1 2.6 0 3.6l-1.8 1.8c-.5.5-.6 1.2-.3 1.8 1.4 2.6 3.4 4.6 6 6 .6.3 1.3.2 1.8-.3l1.8-1.8c1-1 2.6-1 3.6 0l2.9 2.9c1.2 1.2 1.2 3.1 0 4.3l-1.5 1.5c-1.2 1.2-2.9 1.7-4.5 1.2-4-1.1-8.3-3.7-12-7.4-3.7-3.7-6.3-8-7.4-12-.5-1.6 0-3.3 1.2-4.5l1.5-1.5Z"
      />
    </IconShell>
  );
}

/** Weekly Perf — 3 barres */
export function WeeklyIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <rect x="9" y="26" width="8" height="14" rx="2.2" fill="currentColor" opacity=".55" />
      <rect x="20" y="16" width="8" height="24" rx="2.2" fill="currentColor" opacity=".8" />
      <rect x="31" y="10" width="8" height="30" rx="2.2" fill="currentColor" />
    </IconShell>
  );
}

/** Hub — disque + anneau */
export function HubIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="24" cy="24" r="16" stroke="currentColor" strokeWidth="3.5" opacity=".35" />
      <circle cx="24" cy="24" r="8" fill="currentColor" />
      <circle cx="24" cy="7.5" r="2.8" fill="currentColor" />
      <circle cx="24" cy="40.5" r="2.8" fill="currentColor" />
      <circle cx="7.5" cy="24" r="2.8" fill="currentColor" />
      <circle cx="40.5" cy="24" r="2.8" fill="currentColor" />
    </IconShell>
  );
}

export function DemoOverviewIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <rect x="8" y="10" width="32" height="28" rx="4" fill="currentColor" opacity=".25" />
      <rect x="12" y="14" width="14" height="10" rx="2" fill="currentColor" />
      <rect x="28" y="14" width="8" height="20" rx="2" fill="currentColor" opacity=".7" />
      <rect x="12" y="27" width="14" height="7" rx="2" fill="currentColor" opacity=".55" />
    </IconShell>
  );
}

export function DemoNotesIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path fill="currentColor" d="M14 8h16a4 4 0 0 1 4 4v24l-6-4H14a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Z" />
      <path stroke="#000" strokeOpacity=".25" strokeWidth="2.2" strokeLinecap="round" d="M16 16h12M16 21h10M16 26h8" />
    </IconShell>
  );
}

export function DemoUiIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <rect x="9" y="9" width="13" height="13" rx="3" fill="currentColor" />
      <rect x="26" y="9" width="13" height="13" rx="3" fill="currentColor" opacity=".55" />
      <rect x="9" y="26" width="13" height="13" rx="3" fill="currentColor" opacity=".55" />
      <rect x="26" y="26" width="13" height="13" rx="3" fill="currentColor" opacity=".3" />
    </IconShell>
  );
}

export const APP_ICONS = {
  cleaner: CleanerIcon,
  calls: CallsIcon,
  weekly: WeeklyIcon,
  hub: HubIcon,
  "overview-demo": DemoOverviewIcon,
  "notes-demo": DemoNotesIcon,
  "ui-demo": DemoUiIcon,
} as const;
