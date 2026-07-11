/** Icônes dock/launcher — formes pleines qui occupent le carré 48×48. */

import type { ReactNode } from "react";

type IconProps = { className?: string };

function IconShell({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="100%" height="100%" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

/** CRM Cleaner — diamant nettoyage / grille CRM */
export function CleanerIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path fill="currentColor" d="M24 6.5 39.5 24 24 41.5 8.5 24 24 6.5Z" opacity=".22" />
      <path fill="currentColor" d="M24 11.2 34.8 24 24 36.8 13.2 24 24 11.2Z" />
      <path fill="currentColor" d="M24 17.5 29.5 24 24 30.5 18.5 24 24 17.5Z" opacity=".35" />
      <rect x="21.2" y="8" width="5.6" height="32" rx="1.4" fill="currentColor" opacity=".55" transform="rotate(45 24 24)" />
    </IconShell>
  );
}

/** Call Manager — combiné rempli */
export function CallsIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <path
        fill="currentColor"
        d="M16.2 9.8c1.1-1.1 2.9-1.1 4 0l3.2 3.2c.9.9.9 2.4 0 3.3l-2.1 2.1c-.4.4-.5 1.1-.2 1.6 1.3 2.4 3.1 4.3 5.5 5.5.5.3 1.2.2 1.6-.2l2.1-2.1c.9-.9 2.4-.9 3.3 0l3.2 3.2c1.1 1.1 1.1 2.9 0 4l-1.8 1.8c-1.1 1.1-2.6 1.5-4.1 1.1-3.7-1-7.7-3.4-11.1-6.8-3.4-3.4-5.8-7.4-6.8-11.1-.4-1.5 0-3 1.1-4.1l1.8-1.8Z"
      />
      <circle cx="33.5" cy="14.5" r="3.2" fill="currentColor" opacity=".35" />
    </IconShell>
  );
}

/** Weekly Perf — barres de perf + courbe */
export function WeeklyIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <rect x="8" y="28" width="7" height="12" rx="1.8" fill="currentColor" opacity=".45" />
      <rect x="17.5" y="20" width="7" height="20" rx="1.8" fill="currentColor" opacity=".7" />
      <rect x="27" y="14" width="7" height="26" rx="1.8" fill="currentColor" />
      <rect x="36.5" y="22" width="7" height="18" rx="1.8" fill="currentColor" opacity=".55" />
      <path
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 18.5c3.2-6 6.8-9.5 10.8-9.5 4.5 0 6.2 7 10.2 7 3.2 0 5.8-3.2 8-6"
        opacity=".9"
      />
    </IconShell>
  );
}

/** Hub — noyau + anneau système */
export function HubIcon({ className }: IconProps) {
  return (
    <IconShell className={className}>
      <circle cx="24" cy="24" r="15.5" stroke="currentColor" strokeWidth="3.2" opacity=".35" />
      <circle cx="24" cy="24" r="7.2" fill="currentColor" />
      <circle cx="24" cy="8.5" r="2.6" fill="currentColor" />
      <circle cx="24" cy="39.5" r="2.6" fill="currentColor" />
      <circle cx="8.5" cy="24" r="2.6" fill="currentColor" />
      <circle cx="39.5" cy="24" r="2.6" fill="currentColor" />
      <circle cx="12.8" cy="12.8" r="2.2" fill="currentColor" opacity=".7" />
      <circle cx="35.2" cy="12.8" r="2.2" fill="currentColor" opacity=".7" />
      <circle cx="12.8" cy="35.2" r="2.2" fill="currentColor" opacity=".7" />
      <circle cx="35.2" cy="35.2" r="2.2" fill="currentColor" opacity=".7" />
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
