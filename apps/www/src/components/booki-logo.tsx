/**
 * The Booki mark: a ledger, the book of accounts, with the agent's pointer on
 * it. Ink for the book (people's records, debit and credit lines), lime for
 * the agent that works in it. Drawn in tokens, so it follows the theme.
 */
export function BookiMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="booki-mark">
      {/* the ledger */}
      <rect x="2" y="1.5" width="16.5" height="20" rx="3" fill="var(--bk-fg)" />
      {/* debit and credit lines, and the balance */}
      <path d="M6 6.75h8.5M6 14.75h5" stroke="var(--bk-bg)" strokeWidth="1.5" strokeLinecap="round" />
      {/* the line the agent is on: highlighted in its colour */}
      <path d="M5.75 10.75h9" stroke="var(--bk-signal)" strokeWidth="2.4" strokeLinecap="round" />
      {/* the agent's pointer, resting on the ledger */}
      <path
        d="M13.4 11.6 L13.4 22.2 L16.2 19.6 L18.1 23.4 L19.9 22.6 L18.1 18.8 L21.9 18.5 Z"
        fill="var(--bk-signal)"
        stroke="var(--bk-fg)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark and wordmark, for the site's header. */
export function BookiLogo() {
  return (
    <span className="booki-logo">
      <BookiMark size={34} />
      <span className="booki-logo__word">Booki</span>
    </span>
  );
}
