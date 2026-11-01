/** Small hand-drawn style illustrations (inline SVG, no images to download). */

export function EmptyFolder({ className = "h-20 w-24" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 96" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 26c0-4 3-7 7-7h26l8 9h52c4 0 7 3 7 7v42c0 4-3 7-7 7H17c-4 0-7-3-7-7V26z" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2.5" />
      <path d="M14 40h92" stroke="var(--line)" strokeWidth="2" strokeDasharray="3 5" />
      <path d="M38 60c6 5 14 5 20 0" stroke="var(--accent)" strokeWidth="3" />
      <circle cx="42" cy="52" r="2" fill="var(--ink)" />
      <circle cx="55" cy="52" r="2" fill="var(--ink)" />
    </svg>
  );
}

export function PaperStack({ className = "h-28 w-32" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 140 120" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="30" y="18" width="78" height="92" rx="6" transform="rotate(-6 30 18)" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="34" y="14" width="78" height="92" rx="6" fill="var(--surface)" stroke="var(--muted)" strokeWidth="2.5" />
      <path d="M46 34h44M46 46h54M46 58h38M46 70h48" stroke="var(--line)" strokeWidth="3" />
      <path d="M44 86c10-6 20 4 30-2" stroke="var(--primary)" strokeWidth="3" />
      <circle cx="98" cy="88" r="13" stroke="var(--stamp)" strokeWidth="3" />
      <path d="M92 88l4 4 8-8" stroke="var(--stamp)" strokeWidth="3" />
    </svg>
  );
}

export function HandStep({ n }: { n: number }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-12" fill="none">
      <path d="M24 4c11 0 20 8 20 19 0 12-9 21-21 21S4 35 4 24 13 4 24 4z" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <text x="24" y="31" textAnchor="middle" fontSize="20" fontFamily="var(--font-serif)" fill="var(--ink)">
        {n}
      </text>
    </svg>
  );
}
