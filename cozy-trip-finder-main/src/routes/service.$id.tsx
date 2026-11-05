import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Page, Row } from "@/components/tde/Shell";
import { KindIcon, kindLabel } from "@/components/tde/booking-ui";
import { addDays, fmtDate, getService, inr, nightsBetween } from "@/lib/tde/data";
import { useTde } from "@/lib/tde/store";

export const Route = createFileRoute("/service/$id")({
  loader: ({ params }) => { const s = getService(params.id); if (!s) throw notFound(); return s; },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Service"} — TDE` },
      { name: "description", content: loaderData?.about ?? "Service details" },
      { property: "og:title", content: `${loaderData?.name ?? "Service"} — TDE` },
      { property: "og:description", content: loaderData?.about ?? "Service details" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const s = Route.useLoaderData();
  const { search } = useTde();
  const tab = s.kind === "travel" ? "travel" : s.kind === "stay" ? "stays" : "experiences";
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const total = s.kind === "stay" ? s.price * search.rooms * nights : s.price * search.travellers;
  return (
    <Page>
      <nav className="text-sm text-muted-foreground"><Link to="/results" search={{ tab }} className="underline">Results</Link> / {s.name}</nav>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="panel p-6 md:p-8">
            <span className="badge text-primary"><KindIcon s={s} className="mr-1.5 h-3 w-3" />{kindLabel(s)}</span>
            <h1 className="mt-4 text-4xl md:text-5xl">{s.name}</h1>
            <p className="mt-2 text-muted-foreground">{s.kind === "travel" ? `${s.from} → ${s.to}` : s.location} · {s.provider}</p>
            {s.kind === "travel" && (
              <div className="mt-8 grid grid-cols-3 border">
                <div className="p-4"><p className="eyebrow">Departure</p><p className="mt-1 font-serif text-3xl">{s.depart}</p><p className="text-xs text-muted-foreground">{s.from} · {fmtDate(search.date)}</p></div>
                <div className="border-x p-4 text-center"><p className="eyebrow">Duration</p><p className="mt-2 font-mono">{s.duration}</p></div>
                <div className="p-4 text-right"><p className="eyebrow">Arrival</p><p className="mt-1 font-serif text-3xl">{s.arrive}</p><p className="text-xs text-muted-foreground">{s.to} · {fmtDate(s.overnight ? addDays(search.date, 1) : search.date)}</p></div>
              </div>
            )}
          </div>
          <div className="panel p-6"><p className="eyebrow">About this {s.kind === "travel" ? "service" : s.kind}</p><p className="mt-3">{s.about}</p></div>
          <div className="panel p-6"><p className="eyebrow">Included</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{s.included.map((i) => <li key={i} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{i}</li>)}</ul></div>
          <div className="panel p-6"><p className="eyebrow">Cancellation policy</p><p className="mt-3">{s.cancellation}</p></div>
        </div>
        <aside className="panel h-fit p-6 lg:sticky lg:top-6">
          <p className="eyebrow">{s.kind === "stay" ? "Rate per room per night" : "Price per person"}</p>
          <p className="mt-2 font-serif text-4xl">{inr(s.price)}</p>
          <div className="mt-5">
            {s.kind === "stay" ? (
              <>
                <Row k="Dates" v={`${fmtDate(search.checkIn)} – ${fmtDate(search.checkOut)}`} />
                <Row k="Rooms · nights" v={`${search.rooms} · ${nights}`} />
              </>
            ) : (
              <Row k={s.kind === "travel" ? "Travellers" : "Participants"} v={search.travellers} />
            )}
            <Row k="Availability" v="Checked when you continue" />
            <Row k="Estimated total" v={inr(total)} />
          </div>
          <Link to="/book/$id" params={{ id: s.id }} className="btn btn-primary mt-6 w-full">CONTINUE</Link>
          <Link to="/results" search={{ tab }} className="btn btn-outline mt-3 w-full">Back to results</Link>
          <p className="mt-4 text-xs text-muted-foreground">Simulated booking only · No payment is collected</p>
        </aside>
      </div>
    </Page>
  );
}
