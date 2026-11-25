import { brand } from "../theme/brand";

/** The claw mark. */
export function ClawMark({ className = "w-5 h-5", sw = 2.3 }: { className?: string; sw?: number }) {
  return (
    <svg className={`${className} text-accent`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v5" />
      <circle cx="12" cy="9" r="2" />
      <path d="M10 10.5L6 15l2.5 4.5" />
      <path d="M14 10.5L18 15l-2.5 4.5" />
      <path d="M12 11v7" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight text-ink ${className}`}>
      {brand.wordmark[0]}
      <span className="text-accent">{brand.wordmark[1]}</span>
    </span>
  );
}
