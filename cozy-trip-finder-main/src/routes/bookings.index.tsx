import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page } from "@/components/tde/Shell";
import { bookingWhen, countLabel, KindIcon, StatusBadge } from "@/components/tde/booking-ui";
import { getService, inr, type Kind } from "@/lib/tde/data";
import { useTde } from "@/lib/tde/store";

export const Route = createFileRoute("/bookings/")({
  head: () => ({
    meta: [
      { title: "My Bookings — TDE" },
      { name: "description", content: "Manage your travel, stay and experience bookings." },
      { property: "og:title", content: "My Bookings — TDE" },
      { property: "og:description", content: "All your reservations in one place." },
    ],
  }),
  component: Bookings,
});

function Bookings() {
  const { bookings } = useTde();
  const [f, setF] = useState<"all" | Kind>("all");
  const list = bookings.filter((b) => f === "all" || b.kind === f);
  const filters: [typeof f, string][] = [["all", "All"], ["travel", "Travel"], ["stay", "Stay"], ["experience", "Experience"]];
  return (
    <Page>
      <p className="eyebrow">Your account</p>
      <h1 className="mt-3 text-5xl">My Bookings</h1>
      <p className="mt-2 text-muted-foreground">Each provider reservation is managed individually.</p>
      <div className="mt-8 flex flex-wrap gap-2">
        {filters.map(([k, l]) => (
          <button key={k} className="chip" data-active={f === k} onClick={() => setF(k)}>
            {l} <span className="ml-2 font-mono text-xs opacity-70">{bookings.filter((b) => k === "all" || b.kind === k).length}</span>
          </button>
        ))}
      </div>
      <div className="mt-6 border">
        {list.length === 0 && <p className="bg-card p-10 text-center text-muted-foreground">No bookings in this category yet.</p>}
        {list.map((b) => {
          const s = getService(b.serviceId)!;
          return (
            <article key={b.id} className="grid items-center gap-4 border-b bg-card p-5 last:border-b-0 md:grid-cols-[auto_1fr_auto_auto]">
              <span className="flex h-12 w-12 items-center justify-center bg-forest text-forest-foreground"><KindIcon s={s} /></span>
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-sans text-lg font-semibold">{s.name}</h2><StatusBadge status={b.status} /></div>
                <p className="text-sm text-muted-foreground">{s.kind === "travel" ? `${s.from} → ${s.to}` : s.location} · {bookingWhen(b)}</p>
                <p className="text-xs text-muted-foreground">{countLabel(b)} · Ref {b.ref}</p>
              </div>
              <p className="font-serif text-2xl md:text-right">{inr(b.total)}</p>
              <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="btn btn-ink">View Booking</Link>
            </article>
          );
        })}
      </div>
    </Page>
  );
}
