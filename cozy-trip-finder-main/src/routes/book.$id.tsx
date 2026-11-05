import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Field, Page, Row, Section, Steps } from "@/components/tde/Shell";
import { KindIcon, kindLabel } from "@/components/tde/booking-ui";
import { addDays, fmtDate, getService, hotelTotal, inr, nightsBetween, type Service } from "@/lib/tde/data";
import { useTde, type Person } from "@/lib/tde/store";

export const Route = createFileRoute("/book/$id")({
  loader: ({ params }) => { const s = getService(params.id); if (!s) throw notFound(); return s; },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Book ${loaderData?.name ?? ""} — TDE` },
      { name: "description", content: "Enter traveller details and review your booking." },
      { property: "og:title", content: `Book ${loaderData?.name ?? ""} — TDE` },
      { property: "og:description", content: "Enter details and review your booking." },
    ],
  }),
  component: Book,
});

interface Draft { date: string; endDate: string; qty: number; rooms: number; people: Person[]; email: string; phone: string }

function Counter({ value, set, min = 1, max = 9 }: { value: number; set: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex h-11 w-fit border bg-card">
      <button type="button" aria-label="Decrease" className="w-11 border-r" onClick={() => set(Math.max(min, value - 1))}><Minus className="mx-auto h-4 w-4" /></button>
      <span className="flex w-14 items-center justify-center font-semibold">{value}</span>
      <button type="button" aria-label="Increase" className="w-11 border-l" onClick={() => set(Math.min(max, value + 1))}><Plus className="mx-auto h-4 w-4" /></button>
    </div>
  );
}

function Book() {
  const s = Route.useLoaderData() as Service;
  const { search, drafts, saveDraft, addBooking } = useTde();
  const nav = useNavigate();
  const initial: Draft = (drafts[s.id] as Draft) ?? {
    date: s.kind === "stay" ? search.checkIn : s.kind === "experience" ? search.checkIn : search.date,
    endDate: search.checkOut, qty: search.travellers, rooms: search.rooms,
    people: Array.from({ length: search.travellers }, () => ({ name: "", age: "", gender: "", room: 1 })),
    email: "", phone: "",
  };
  const [d, setD] = useState<Draft>(initial);
  const [step, setStep] = useState<0 | 1>(0);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const update = (p: Partial<Draft>) => { const n = { ...d, ...p }; setD(n); saveDraft(s.id, n); };
  const setQty = (q: number) => {
    const people = Array.from({ length: q }, (_, i) => d.people[i] ?? { name: "", age: "", gender: "", room: 1 });
    update({ qty: q, people, rooms: Math.min(d.rooms, q) });
  };
  const setPerson = (i: number, p: Partial<Person>) => update({ people: d.people.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  const nights = nightsBetween(d.date, d.endDate);
  const total = s.kind === "stay" ? hotelTotal(s.price, d.rooms, nights) : s.price * d.qty;
  const personWord = s.kind === "travel" ? "Passenger" : s.kind === "stay" ? "Guest" : "Participant";
  const tab = s.kind === "travel" ? "travel" : s.kind === "stay" ? "stays" : "experiences";

  const validate = () => {
    const e: Record<string, string> = {};
    d.people.forEach((p, i) => {
      if (s.kind === "stay" && i > 0) return; // only lead guest name is required
      if (!p.name.trim()) e[`n${i}`] = "Full name is required";
      if (s.kind !== "stay" && (!p.age || +p.age < 1 || +p.age > 120)) e[`a${i}`] = "Enter a valid age";
    });
    if (!/^\S+@\S+\.\S+$/.test(d.email)) e.email = "Enter a valid email address";
    if (!/^[6-9]\d{9}$/.test(d.phone)) e.phone = "Enter a 10-digit mobile number";
    if (s.kind === "stay") {
      if (nights < 1) e.dates = "Check-out must be after check-in";
      const used = new Set(d.people.map((p) => p.room ?? 1));
      if (used.size < d.rooms) e.rooms = "Each room needs at least one guest";
    }
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const confirm = () => {
    setBusy(true);
    const id = "b" + Date.now();
    const prefix = s.kind === "travel" ? (s.mode === "Bus" ? "BUS" : s.mode === "Train" ? "TRN" : "FLT") : s.kind === "stay" ? "STY" : "EXP";
    addBooking({
      id, ref: `TDE-${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, serviceId: s.id, kind: s.kind, status: "Confirmed",
      date: d.date, endDate: s.kind === "stay" ? d.endDate : s.overnight ? addDays(d.date, 1) : undefined,
      qty: d.qty, rooms: s.kind === "stay" ? d.rooms : undefined,
      people: s.kind === "stay" ? d.people.map((p, i) => ({ name: p.name || `Guest ${i + 1}`, room: p.room })) : d.people,
      contact: { email: d.email, phone: d.phone }, total, createdAt: new Date().toISOString(),
    });
    saveDraft(s.id, undefined);
    setTimeout(() => nav({ to: "/confirmation/$bookingId", params: { bookingId: id } }), 400);
  };

  const summary = (
    <div className="flex gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-forest text-forest-foreground"><KindIcon s={s} /></span>
      <div>
        <p className="badge text-muted-foreground">{kindLabel(s)}</p>
        <p className="mt-1 font-serif text-2xl">{s.name}</p>
        <p className="text-sm text-muted-foreground">{s.provider} · {s.kind === "travel" ? `${s.from} → ${s.to}` : s.location}</p>
      </div>
    </div>
  );

  const priceBox = (
    <div>
      {s.kind === "stay" ? (
        <>
          <Row k="Rate" v={`${inr(s.price)} per room per night`} />
          <Row k="Rooms" v={d.rooms} />
          <Row k="Nights" v={nights} />
          <p className="mt-3 bg-muted px-3 py-2 font-mono text-xs">{inr(s.price)} × {d.rooms} room{d.rooms > 1 ? "s" : ""} × {nights} night{nights !== 1 ? "s" : ""} = {inr(total)}</p>
        </>
      ) : (
        <>
          <Row k={`${inr(s.price)} × ${d.qty} ${personWord.toLowerCase()}${d.qty > 1 ? "s" : ""}`} v={inr(total)} />
          <Row k="Taxes & fees" v="Included" />
        </>
      )}
      <div className="mt-3 flex items-baseline justify-between border-t pt-3"><span className="font-semibold">Total</span><span className="font-serif text-3xl">{inr(total)}</span></div>
    </div>
  );

  if (step === 1) {
    return (
      <Page className="max-w-4xl">
        <Steps step={1} />
        <h1 className="mt-8 text-4xl md:text-5xl">Review your booking</h1>
        <p className="mt-2 text-muted-foreground">Check the details below before confirming.</p>
        <div className="mt-8 space-y-5">
          <Section title="1 · Selected service">{summary}</Section>
          <Section title={s.kind === "travel" ? "2 · Journey details" : "2 · Reservation details"}>
            {s.kind === "travel" && (<>
              <Row k="Departure" v={`${fmtDate(d.date, { weekday: true })}, ${s.depart} IST · ${s.from}`} />
              <Row k="Arrival" v={`${fmtDate(s.overnight ? addDays(d.date, 1) : d.date, { weekday: true })}, ${s.arrive} IST · ${s.to}`} />
              <Row k="Duration" v={s.duration} />
            </>)}
            {s.kind === "stay" && (<>
              <Row k="Check-in date" v={fmtDate(d.date, { weekday: true })} />
              <Row k="Check-out date" v={fmtDate(d.endDate, { weekday: true })} />
              <Row k="Rooms · guests" v={`${d.rooms} room${d.rooms > 1 ? "s" : ""} · ${d.qty} guest${d.qty > 1 ? "s" : ""}`} />
            </>)}
            {s.kind === "experience" && (<>
              <Row k="Date" v={fmtDate(d.date, { weekday: true })} />
              <Row k="Time" v={`${s.start}–${s.end} IST (${s.duration})`} />
              <Row k="Meeting point" v={s.location} />
            </>)}
          </Section>
          <Section title="3 · Customer information" action={<button className="text-xs font-semibold text-primary underline" onClick={() => setStep(0)}>Edit</button>}>
            {d.people.map((p, i) => (
              <Row key={i} k={`${personWord} ${i + 1}${i === 0 ? " (lead)" : ""}`} v={`${p.name || "—"}${p.age ? `, ${p.age}` : ""}${p.gender ? `, ${p.gender}` : ""}${s.kind === "stay" ? ` · Room ${p.room}` : ""}`} />
            ))}
            <Row k="Email" v={d.email} />
            <Row k="Phone" v={d.phone} />
          </Section>
          <Section title="4 · Cancellation policy"><p>{s.cancellation}</p></Section>
          <Section title="5 · Price breakdown">{priceBox}</Section>
          <div className="panel flex flex-col-reverse gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <button className="btn btn-outline" onClick={() => setStep(0)}>Back to Edit</button>
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <button className="btn btn-primary min-w-56" disabled={busy} onClick={confirm}>{busy ? "Confirming…" : "Confirm Booking"}</button>
              <span className="text-xs text-muted-foreground">Simulated booking — no payment is collected.</span>
            </div>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page className="max-w-5xl">
      <Steps step={0} />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (validate()) { setStep(1); window.scrollTo(0, 0); } }} className="space-y-6">
          <h1 className="text-4xl">{s.kind === "travel" ? "Passenger details" : s.kind === "stay" ? "Guest details" : "Participant details"}</h1>

          <Section title={s.kind === "travel" ? "Journey" : s.kind === "stay" ? "Booking dates & rooms" : "Experience date & participants"}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={s.kind === "stay" ? "Check-in date" : s.kind === "travel" ? "Travel date" : "Experience date"}>
                <input type="date" className="field-input" value={d.date} onChange={(e) => update({ date: e.target.value })} />
              </Field>
              {s.kind === "stay" && (
                <Field label="Check-out date" error={err.dates}>
                  <input type="date" className="field-input" aria-invalid={!!err.dates} value={d.endDate} onChange={(e) => update({ endDate: e.target.value })} />
                </Field>
              )}
              {s.kind === "stay" && <Field label="Number of rooms" error={err.rooms}><Counter value={d.rooms} set={(n) => update({ rooms: n, people: d.people.map((p) => ({ ...p, room: Math.min(p.room ?? 1, n) })) })} max={d.qty} /></Field>}
              <Field label={`Number of ${personWord.toLowerCase()}s`}><Counter value={d.qty} set={setQty} /></Field>
            </div>
          </Section>

          <Section title={`${personWord} details`}>
            <div className="space-y-6">
              {d.people.map((p, i) => (
                <fieldset key={i} className="border-l-2 border-primary pl-4">
                  <legend className="mb-3 text-sm font-semibold">{personWord} {i + 1}{i === 0 && " · Lead"}</legend>
                  <div className={`grid gap-4 ${s.kind === "stay" ? "sm:grid-cols-[2fr_1fr]" : s.kind === "travel" ? "sm:grid-cols-[2fr_1fr_1fr]" : "sm:grid-cols-[2fr_1fr]"}`}>
                    <Field label={s.kind === "stay" && i > 0 ? "Full name (optional)" : "Full name"} error={err[`n${i}`]}>
                      <input className="field-input" aria-invalid={!!err[`n${i}`]} placeholder="As on government ID" value={p.name} onChange={(e) => setPerson(i, { name: e.target.value })} />
                    </Field>
                    {s.kind !== "stay" && (
                      <Field label="Age" error={err[`a${i}`]}>
                        <input className="field-input" inputMode="numeric" aria-invalid={!!err[`a${i}`]} value={p.age} onChange={(e) => setPerson(i, { age: e.target.value.replace(/\D/g, "") })} />
                      </Field>
                    )}
                    {s.kind === "travel" && (
                      <Field label="Gender">
                        <select className="field-input" value={p.gender} onChange={(e) => setPerson(i, { gender: e.target.value })}>
                          <option value="">Select</option><option>Female</option><option>Male</option><option>Other</option>
                        </select>
                      </Field>
                    )}
                    {s.kind === "stay" && (
                      <Field label="Room">
                        <select className="field-input" value={p.room} onChange={(e) => setPerson(i, { room: +e.target.value })}>
                          {Array.from({ length: d.rooms }, (_, r) => <option key={r} value={r + 1}>Room {r + 1}</option>)}
                        </select>
                      </Field>
                    )}
                  </div>
                </fieldset>
              ))}
            </div>
          </Section>

          <Section title="Contact details">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Contact email" error={err.email} hint="Ticket / voucher is sent here"><input type="email" className="field-input" aria-invalid={!!err.email} placeholder="you@email.com" value={d.email} onChange={(e) => update({ email: e.target.value })} /></Field>
              <Field label="Contact phone" error={err.phone}><input type="tel" className="field-input" aria-invalid={!!err.phone} placeholder="98765 43210" value={d.phone} onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></Field>
            </div>
          </Section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Link to="/service/$id" params={{ id: s.id }} className="btn btn-outline">Back</Link>
            <button className="btn btn-primary min-w-56">Review Booking</button>
          </div>
        </form>
        <aside className="panel h-fit p-5 lg:sticky lg:top-6">
          {summary}
          <div className="mt-5 border-t pt-4">{priceBox}</div>
          <Link to="/results" search={{ tab }} className="mt-4 block text-center text-xs text-muted-foreground underline">Back to results</Link>
        </aside>
      </div>
    </Page>
  );
}
