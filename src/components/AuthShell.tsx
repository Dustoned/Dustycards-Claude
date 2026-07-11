import type { ReactNode } from "react";
import { Layers3, ShieldCheck, TrendingUp } from "lucide-react";

const BENEFITS = [
  { icon: Layers3, label: "Cards, binders, graded, and sealed in one workspace" },
  { icon: TrendingUp, label: "Collection value, progress, and market context" },
  { icon: ShieldCheck, label: "Private account with verified email and secure sessions" },
];

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-var(--ui-header-height))] w-full max-w-[90rem] items-start px-4 py-6 sm:items-center sm:py-10 lg:px-8">
      <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] xl:gap-14">
        <section className="hidden min-w-0 lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200/68">
            Your collector workspace
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-black leading-tight tracking-tight text-white xl:text-5xl">
            Keep the collection clear, valuable, and easy to act on.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/52">
            DustyCards brings collection management and market context together without turning every screen into a spreadsheet.
          </p>
          <div className="mt-7 grid max-w-2xl gap-3">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm font-semibold text-white/72">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-500/[0.1] text-violet-100">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {label}
              </div>
            ))}
          </div>
        </section>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
