import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/components/tde/Shell";
import { fmtDate, getService, inr } from "@/lib/tde/data";
import { useTde } from "@/lib/tde/store";

export const Route = createFileRoute("/trips/")({
  head: () => ({
    meta: [
      { title: "Trips — TDE" },
      { name: "description", content: "Group your bookings into day-by-day itineraries." },
      { property: "og:title", content: "Trips — TDE" },
      { property: "og:description", content: "Your itineraries in one place." },
    ],
  }),
  component: Trips,
});

function Trips() {
  const { trips, bookings } = useTde();
  return (
    <Page>
      <p className="eyebrow">Itineraries</p>
      <h1 className="mt-3 text-5xl">Trips</h1>
      <p className="mt-2 text-muted-foreground">Trips group bookings you've already made into one itinerary.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {trips.length === 0 && <p className="panel p-10 text-muted-foreground">No trips yet. Book something, then choose “Add to Trip”.</p>}
        {trips.map((t) => {
          const bs = bookings.filter((b) => t.bookingIds.includes(b.id) && b.status === "Confirmed");
          const dates = bs.flatMap((b) => [b.date, b.endDate ?? b.date]).sort();
          return (
            <article key={t.id} className="panel p-6">
              <h2 className="text-3xl">{t.name}</h2>
              <p className="text-muted-foreground">{t.destination}{dates.length ? ` · ${fmtDate(dates[0])} – ${fmtDate(dates.at(-1)!)}` : ""}</p>
              <ul className="mt-4 space-y-1 text-sm">{bs.map((b) => <li key={b.id}>— {getService(b.serviceId)!.name}</li>)}</ul>
              <div className="mt-5 flex items-center justify-between border-t pt-4">
                <span className="font-serif text-2xl">{inr(bs.reduce((a, b) => a + b.total, 0))}</span>
                <Link to="/trips/$tripId" params={{ tripId: t.id }} className="btn btn-ink">View Itinerary</Link>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}
