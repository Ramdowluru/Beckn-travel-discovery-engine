import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { useState } from "react";
import { Field, Page, Row, Section } from "@/components/tde/Shell";
import { bookingWhen, countLabel, downloadTicket, kindLabel, StatusBadge } from "@/components/tde/booking-ui";
import { getService, inr } from "@/lib/tde/data";
import { useTde } from "@/lib/tde/store";

export const Route = createFileRoute("/bookings/$bookingId")({
  head: () => ({
    meta: [
      { title: "Booking details — TDE" },
      { name: "description", content: "View, download or cancel your booking." },
      { property: "og:title", content: "Booking details — TDE" },
      { property: "og:description", content: "Reservation summary and cancellation." },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { bookingId } = Route.useParams();
  const { bookings, cancelBooking } = useTde();
  const b = bookings.find((x) => x.id === bookingId);
  const [mode, setMode] = useState<"view" | "cancel" | "done">("view");
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState("");
  if (!b) return <Page><p>Booking not found.</p></Page>;
  const s = getService(b.serviceId)!;
  const word = b.kind === "travel" ? "Passenger" : b.kind === "stay" ? "Guest" : "Participant";

  return (
    <Page className="max-w-4xl">
      <Link to="/bookings" className="text-sm text-muted-foreground underline">← My Bookings</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="badge text-muted-foreground">{kindLabel(s)}</p>
          <h1 className="mt-3 text-4xl md:text-5xl">{s.name}</h1>
          <p className="mt-1 text-muted-foreground">{s.provider} · Ref <span className="font-mono">{b.ref}</span></p>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {mode === "done" && (
        <div className="panel mt-6 flex items-start gap-3 border-l-4 border-l-success p-5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div><p className="font-semibold">Booking cancelled</p><p className="text-sm text-muted-foreground">This was a simulated booking, so no refund is due. A cancellation note was sent to {b.contact.email}.</p></div>
        </div>
      )}

      <div className="mt-6 space-y-5">
        <Section title="Reservation summary">
          <Row k={b.kind === "stay" ? "Dates" : "Date & time"} v={bookingWhen(b)} />
          <Row k="Booked for" v={countLabel(b)} />
          <Row k="Status" v={b.status} />
          <Row k="Total" v={<span className="font-serif text-xl">{inr(b.total)}</span>} />
        </Section>
        <Section title="Customer details">
          {b.people.map((p, i) => <Row key={i} k={`${word} ${i + 1}`} v={`${p.name}${p.age ? `, ${p.age}` : ""}${p.room ? ` · Room ${p.room}` : ""}`} />)}
          <Row k="Email" v={b.contact.email} />
          <Row k="Phone" v={b.contact.phone} />
        </Section>
        <Section title="Cancellation policy"><p>{s.cancellation}</p>{b.cancelReason && <p className="mt-2 text-sm text-muted-foreground">Cancellation reason: {b.cancelReason}</p>}</Section>

        {mode === "cancel" && b.status === "Confirmed" && (
          <section className="panel border-destructive p-6">
            <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /><h2 className="font-sans text-lg font-semibold">Cancel this booking</h2></div>
            <p className="mt-2 text-sm text-muted-foreground">{s.cancellation} This cancels the whole booking with {s.provider}.</p>
            <div className="mt-5 space-y-4">
              <Field label="Reason for cancellation" error={err}>
                <select className="field-input" aria-invalid={!!err} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Select a reason</option>
                  <option>Change of plans</option><option>Booked by mistake</option><option>Found a better option</option><option>Other</option>
                </select>
              </Field>
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} />I understand this cancels the entire {kindLabel(s).toLowerCase()} booking and cannot be undone.</label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button className="btn btn-outline" onClick={() => setMode("view")}>Keep Booking</button>
                <button className="btn btn-danger" disabled={!ack} onClick={() => { if (!reason) return setErr("Please choose a reason"); cancelBooking(b.id, reason); setMode("done"); }}>Confirm Cancellation</button>
              </div>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="btn btn-primary" disabled={b.status !== "Confirmed"} onClick={() => downloadTicket(b)}><Download className="h-4 w-4" /> Download {b.kind === "travel" ? "Ticket" : "Voucher"}</button>
          {b.status === "Confirmed" && mode === "view" && <button className="btn btn-outline text-destructive sm:ml-auto" onClick={() => setMode("cancel")}>Cancel Booking</button>}
        </div>
      </div>
    </Page>
  );
}
