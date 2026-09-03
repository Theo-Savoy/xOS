type IconProps = {
  className?: string;
};

export function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

export function ChevronIcon({
  direction = 'down',
  className,
}: IconProps & { direction?: 'up' | 'down' | 'right' | 'left' }) {
  const rotation =
    direction === 'up'
      ? 'rotate(-180deg)'
      : direction === 'right'
        ? 'rotate(-90deg)'
        : direction === 'left'
          ? 'rotate(90deg)'
          : undefined;

  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={
        rotation ? { transform: rotation, transformOrigin: 'center' } : undefined
      }
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 2.5a1.5 1.5 0 0 0-1.5 1.5c0 5.25 4.25 9.5 9.5 9.5a1.5 1.5 0 0 0 1.5-1.5v-2a1 1 0 0 0-.75-.97l-2.2-.55a1 1 0 0 0-1.05.39l-.85 1.13a7.8 7.8 0 0 1-3.65-3.65l1.13-.85a1 1 0 0 0 .39-1.05l-.55-2.2A1 1 0 0 0 4.5 2.5h-1z" />
    </svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2.5 4.5l5.5 4 5.5-4" />
    </svg>
  );
}
