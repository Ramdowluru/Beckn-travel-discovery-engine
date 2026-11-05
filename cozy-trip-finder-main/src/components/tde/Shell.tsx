import { Link, useLocation } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTde } from "@/lib/tde/store";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3">
      <span className="flex h-10 w-12 items-center justify-center bg-forest-foreground font-serif text-lg text-forest">TDE</span>
      <span className="hidden sm:block">
        <span className="block text-sm font-bold tracking-[0.12em] text-forest-foreground">TRAVEL DISCOVERY ENGINE</span>
        <span className="block text-xs text-forest-muted">Flights · hotels · experiences</span>
      </span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useTde();
  const [open, setOpen] = useState(false);
  const section = pathname.startsWith("/bookings") ? "bookings" : pathname.startsWith("/trips") ? "trips" : "explore";
  const items = [
    { key: "explore", label: "Explore", to: "/" as const },
    { key: "bookings", label: "My Bookings", to: "/bookings" as const },
    { key: "trips", label: "Trips", to: "/trips" as const },
  ];
  const initials = (user ?? "Guest").slice(0, 2).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-forest">
        <div className="mx-auto flex h-18 max-w-6xl items-center gap-10 px-4 py-3 md:px-6">
          <Logo />
          <nav className="hidden gap-8 md:flex">
            {items.map((i) => (
              <Link key={i.key} to={i.to} data-active={section === i.key} className="border-b-2 border-transparent py-1 text-forest-foreground/85 hover:text-forest-foreground data-[active=true]:border-primary data-[active=true]:text-primary">
                {i.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            <span className="flex h-9 w-9 items-center justify-center bg-primary font-serif text-sm text-primary-foreground">{initials}</span>
            <span className="text-forest-foreground">{user ?? "Guest"}</span>
          </div>
          <button aria-label="Menu" className="ml-auto flex h-11 w-11 items-center justify-center text-forest-foreground md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-forest-muted/30 md:hidden">
            {items.map((i) => (
              <Link key={i.key} to={i.to} onClick={() => setOpen(false)} data-active={section === i.key} className="block border-l-4 border-transparent px-5 py-4 text-forest-foreground data-[active=true]:border-primary data-[active=true]:text-primary">
                {i.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-forest text-forest-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-6">
          <div>
            <p className="font-serif text-3xl leading-tight">One journey.<br /><em className="text-primary">Many providers.</em></p>
            <p className="mt-4 max-w-sm text-sm text-forest-muted">TDE connects transport, lodging and local experience networks into a single, direct, peer-to-peer transaction stream.</p>
          </div>
          {[
            ["Explore", ["Flights & trains", "Hotels & stays", "Experiences"]],
            ["Company", ["About us", "Become a partner", "Careers"]],
            ["Support", ["Help center", "Cancellations", "Contact us"]],
          ].map(([h, l]) => (
            <div key={h as string}>
              <p className="eyebrow text-forest-muted">{h}</p>
              <ul className="mt-4 space-y-2 text-sm">{(l as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="border-t border-forest-muted/25">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-forest-muted md:px-6">
            <span>© 2026 TDE. Academic prototype — all bookings are simulated, no payment is collected.</span>
            <Link to="/handoff" className="underline">Design handoff notes</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-6xl px-4 py-10 md:px-6 ${className}`}>{children}</div>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block text-foreground">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Steps({ step }: { step: 0 | 1 | 2 }) {
  const labels = ["Details", "Review", "Confirmed"];
  return (
    <ol className="flex border">
      {labels.map((l, i) => (
        <li key={l} data-on={i <= step} className="flex-1 border-r px-3 py-2 text-center text-xs font-semibold tracking-wider last:border-r-0 data-[on=true]:bg-ink data-[on=true]:text-ink-foreground">
          {i + 1}. {l.toUpperCase()}
        </li>
      ))}
    </ol>
  );
}

export function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
