interface Props {
  reason?: string | null;
  className?: string;
}

/**
 * Renders a red "DO NOT CONTACT" banner. Show whenever
 * account.metadata.do_not_contact === true anywhere a contact is exposed for
 * outreach (slide-out contact block, dossier outreach kit, account/contact
 * detail pages).
 */
export default function DoNotContactBanner({ reason, className = "" }: Props) {
  return (
    <div className={`border border-destructive/60 bg-destructive/10 text-destructive rounded px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider ${className}`}>
      ⚠ Do not contact
      {reason ? <span className="normal-case tracking-normal opacity-80"> · {reason}</span> : null}
    </div>
  );
}
