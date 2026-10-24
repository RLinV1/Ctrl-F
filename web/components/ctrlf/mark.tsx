/** The Ctrl-F mark: a brass loupe ring over an "F", drawn for this product. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 32 32">
      <rect fill="var(--ink)" height="32" width="32" />
      <path d="M11 8h10v3h-6.5v3.5H20v3h-5.5V24H11z" fill="var(--paper)" />
      <circle cx="21" cy="21" fill="none" r="6.5" stroke="var(--brass)" strokeWidth="2.5" />
      <path d="M25.6 25.6 29 29" stroke="var(--brass)" strokeWidth="3" />
    </svg>
  );
}
