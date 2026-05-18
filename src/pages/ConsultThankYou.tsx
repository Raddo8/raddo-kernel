import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function ConsultThankYou() {
  useEffect(() => {
    document.title = "RADDO · Consult submitted";
  }, []);

  return (
    <main className="flex min-h-screen items-center bg-raddo-paper px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-[36px] border border-raddo-paper-edge bg-white p-8 shadow-[0_30px_80px_rgba(12,68,124,0.08)] md:p-12">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-raddo-ash">Submission received</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-raddo-charcoal md:text-5xl">
          Your consult is submitted.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-raddo-ash">
          Expect a response within 2 business days. The consult is reviewed as signal, not as a lead-form trophy. If the shape of the work is real, the reply will be specific.
        </p>
        <div className="mt-8 border-t border-raddo-paper-edge pt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-raddo-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-raddo-ink-deep"
          >
            Back to raddo.ai
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
