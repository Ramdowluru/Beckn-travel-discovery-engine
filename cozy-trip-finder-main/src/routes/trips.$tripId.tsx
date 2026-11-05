import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Page } from "@/components/tde/Shell";
import { countLabel, KindIcon, StatusBadge } from "@/components/tde/booking-ui";
import { addDays, fmtDate, getService, inr } from "@/lib/tde/data";
import { useTde, type Booking } from "@/lib/tde/store";

export const Route = createFileRoute("/trips/$tripId")({
  head: () => ({
    meta: [
      { title: "Trip itinerary — TDE" },
      { name: "description", content: "Your day-by-day trip itinerary." },
      { property: "og:title", content: "Trip itinerary — TDE" },
      { property: "og:description", content: "Day-grouped itinerary of your bookings." },
    ],
  }),
  component: Itinerary,
});

interface Ev { date: string; label: string; b: Booking; detail: string; tag: string }

function buildEvents(bs: Booking[]): Ev[] {
  const ev: Ev[] = [];
  for (const b of bs) {
    const s = getService(b.serviceId)!;
    if (s.kind === "travel") {
      const arr = s.overnight ? addDays(b.date, 1) : b.date;
      ev.push({ date: b.date, b, tag: "Travel", label: `${s.mode} from ${s.from} to ${s.to}`, detail: `Departs ${fmtDate(b.date)}, ${s.depart} IST · Arrives ${fmtDate(arr)}, ${s.arrive} IST` });
    } else if (s.kind === "stay") {
      ev.push({ date: b.date, b, tag: "Stay", label: `Check-in · ${s.name}`, detail: `Check-in date · ${countLabel(b)}` });
      for (let d = addDays(b.date, 1); d < b.endDate!; d = addDays(d, 1)) ev.push({ date: d, b, tag: "Stay", label: `Hotel stay continues · ${s.name}`, detail: s.location! });
      ev.push({ date: b.endDate!, b, tag: "Departure", label: `Check-out · ${s.name}`, detail: "Check-out date" });
    } else {
      ev.push({ date: b.date, b, tag: "Experience", label: s.name, detail: `${s.start}–${s.end} IST · ${countLabel(b)}` });
    }
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}

function Itinerary() {
  const { tripId } = Route.useParams();
  const { trips, bookings } = useTde();
  const [manage, setManage] = useState(false);
  const t = trips.find((x) => x.id === tripId);
  if (!t) return <Page><p>Trip not found.</p></Page>;
  const bs = bookings.filter((b) => t.bookingIds.includes(b.id) && b.status === "Confirmed");
  const events = buildEvents(bs);
  const days = [...new Set(events.map((e) => e.date))];

  return (
    <Page className="max-w-4xl">
      <Link to="/trips" className="text-sm text-muted-foreground underline">← Trips</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl">{t.name}</h1>
          <p className="mt-1 text-muted-foreground">{t.destination}{days.length ? ` · ${fmtDate(days[0])} – ${fmtDate(days.at(-1)!)}` : ""} · {bs.length} bookings · {inr(bs.reduce((a, b) => a + b.total, 0))}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setManage(!manage)}>{manage ? "Done" : "Manage Trip"}</button>
      </div>

      {manage && (
        <div className="panel mt-6 p-5">
          <p className="eyebrow">Bookings in this trip</p>
          {bs.map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b py-3 last:border-0">
              <span>{getService(b.serviceId)!.name} <StatusBadge status={b.status} /></span>
              <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="btn btn-outline min-h-9 text-xs">Manage</Link>
            </div>
          ))}
        </div>
      )}

      <ol className="mt-10">
        {days.map((d, di) => (
          <li key={d} className="relative pb-10 pl-10 last:pb-0">
            {di < days.length - 1 && <span className="absolute left-[11px] top-6 h-full w-0.5 bg-border" />}
            <span className="absolute left-0 top-1 h-6 w-6 border-4 border-background bg-primary" />
            <h2 className="text-2xl">{fmtDate(d, { weekday: true })}</h2>
            <p className="eyebrow">{[...new Set(events.filter((e) => e.date === d).map((e) => e.tag))].join(" & ")}</p>
            <div className="mt-4 space-y-3">
              {events.filter((e) => e.date === d).map((e, i) => {
                const s = getService(e.b.serviceId)!;
                return (
                  <div key={i} className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-forest text-forest-foreground"><KindIcon s={s} /></span>
                    <div className="flex-1">
                      <p className="font-semibold">{e.label}</p>
                      <p className="text-sm text-muted-foreground">{e.detail}</p>
                    </div>
                    {(e.tag !== "Stay" || e.label.startsWith("Check-in")) && (
                      <div className="flex items-center gap-4">
                        <span className="font-serif text-xl">{inr(e.b.total)}</span>
                        <Link to="/bookings/$bookingId" params={{ bookingId: e.b.id }} className="btn btn-ink min-h-10">View Booking</Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </Page>
  );
}
