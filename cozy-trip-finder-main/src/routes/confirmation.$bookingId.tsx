import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Download } from "lucide-react";
import { Page, Row } from "@/components/tde/Shell";
import { bookingWhen, countLabel, downloadTicket } from "@/components/tde/booking-ui";
import { getService, inr } from "@/lib/tde/data";
import { useTde } from "@/lib/tde/store";

export const Route = createFileRoute("/confirmation/$bookingId")({
  head: () => ({
    meta: [
      { title: "Booking confirmed — TDE" },
      { name: "description", content: "Your simulated booking is confirmed. Download your ticket or voucher." },
      { property: "og:title", content: "Booking confirmed — TDE" },
      { property: "og:description", content: "Download your ticket and continue planning." },
    ],
  }),
  component: Confirmed,
});

function Confirmed() {
  const { bookingId } = Route.useParams();
  const { bookings, search, addToTrip, setSearch } = useTde();
  const nav = useNavigate();
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return <Page><p>Booking not found.</p><Link to="/bookings" className="btn btn-ink mt-4">My Bookings</Link></Page>;
  const s = getService(b.serviceId)!;
  const doc = b.kind === "travel" ? "Ticket" : "Voucher";
  const dest = s.to ?? s.location ?? search.to;
  return (
    <Page className="max-w-3xl">
      <div className="panel border-t-4 border-t-success p-8 text-center md:p-12">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <p className="eyebrow mt-4 text-success">Booking confirmed</p>
        <h1 className="mt-3 text-4xl md:text-5xl">You're all set.</h1>
        <p className="mt-3 text-muted-foreground">Reference <span className="font-mono font-semibold text-foreground">{b.ref}</span> · details sent to {b.contact.email}</p>
        <button className="btn btn-primary mt-8 min-h-14 w-full text-base sm:w-auto sm:px-12" onClick={() => downloadTicket(b)}>
          <Download className="h-5 w-5" /> Download {doc}
        </button>
      </div>
      <div className="panel mt-5 p-6">
        <p className="eyebrow">Summary</p>
        <p className="mt-2 font-serif text-2xl">{s.name}</p>
        <p className="text-sm text-muted-foreground">{s.provider}</p>
        <div className="mt-4">
          <Row k={b.kind === "stay" ? "Dates" : "Date & time"} v={bookingWhen(b)} />
          <Row k="Booked for" v={countLabel(b)} />
          <Row k="Total" v={<span className="font-serif text-xl">{inr(b.total)}</span>} />
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Link to="/bookings/$bookingId" params={{ bookingId: b.id }} className="btn btn-ink">View Booking</Link>
        <button className="btn btn-outline" onClick={() => { const t = addToTrip(b.id); nav({ to: "/trips/$tripId", params: { tripId: t } }); }}>Add to Trip</button>
      </div>
      <div className="mt-10">
        <p className="eyebrow">Continue planning in {dest}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {b.kind !== "stay" && (
            <button className="panel p-5 text-left hover:border-foreground" onClick={() => { setSearch({ to: dest, checkIn: b.endDate ?? b.date }); nav({ to: "/results", search: { tab: "stays" } }); }}>
              <p className="font-serif text-xl">Find stays in {dest}</p><p className="text-sm text-muted-foreground">From your arrival date · {b.qty} guest{b.qty > 1 ? "s" : ""}</p>
            </button>
          )}
          {b.kind !== "experience" && (
            <button className="panel p-5 text-left hover:border-foreground" onClick={() => { setSearch({ to: dest }); nav({ to: "/results", search: { tab: "experiences" } }); }}>
              <p className="font-serif text-xl">Explore experiences</p><p className="text-sm text-muted-foreground">Local activities in {dest}</p>
            </button>
          )}
          {b.kind === "stay" && (
            <button className="panel p-5 text-left hover:border-foreground" onClick={() => nav({ to: "/results", search: { tab: "travel" } })}>
              <p className="font-serif text-xl">Find transport</p><p className="text-sm text-muted-foreground">Getting to and from {dest}</p>
            </button>
          )}
        </div>
      </div>
    </Page>
  );
}
