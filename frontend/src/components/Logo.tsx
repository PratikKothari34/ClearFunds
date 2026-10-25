/** Three ledger lines, the middle one marked: an entry stays on the page. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <rect x="8" y="8" width="16" height="3" rx="1.5" className="fill-bg" />
      <rect x="8" y="14.5" width="11" height="3" rx="1.5" className="fill-accent" />
      <rect x="8" y="21" width="16" height="3" rx="1.5" className="fill-bg" />
    </svg>
  )
}
