import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/tde/Shell";
import { SearchBar } from "@/components/tde/SearchBar";
import { KindIcon } from "@/components/tde/booking-ui";
import { fmtDate, inr, nightsBetween, SERVICES, type Mode } from "@/lib/tde/data";
import { useTde } from "@/lib/tde/store";

type Tab = "travel" | "stays" | "experiences";
export const Route = createFileRoute("/results")({
  validateSearch: (s: Record<string, unknown>): { tab: Tab } => ({
    tab: s.tab === "stays" || s.tab === "experiences" ? s.tab : "travel",
  }),
  head: () => ({
    meta: [
      { title: "Search results — TDE" },
      { name: "description", content: "Compare transport, stays and experiences for your route." },
      { property: "og:title", content: "Search results — TDE" },
      { property: "og:description", content: "Transport, stays and experiences in one list." },
    ],
  }),
  component: Results,
});

function Results() {
  const { tab } = Route.useSearch();
  const { search } = useTde();
  const [editing, setEditing] = useState(false);
  const [sort, setSort] = useState<"low" | "high" | "dur">("low");
  const [modes, setModes] = useState<Mode[]>([]);
  const [slot, setSlot] = useState<string[]>([]);
  const [max, setMax] = useState(4100);

  const kindOf = { travel: "travel", stays: "stay", experiences: "experience" } as const;
  const counts = { travel: 0, stays: 0, experiences: 0 } as Record<Tab, number>;
  SERVICES.forEach((s) => { const t = (Object.keys(kindOf) as Tab[]).find((k) => kindOf[k] === s.kind)!; counts[t]++; });

  const slotOf = (t: string) => { const h = +t.slice(0, 2); return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"; };
  const mins = (d?: string) => { const [h, m] = (d ?? "0h 0m").match(/\d+/g)!.map(Number); return h * 60 + m; };
  let list = SERVICES.filter((s) => s.kind === kindOf[tab] && s.price <= max);
  if (tab === "travel") {
    if (modes.length) list = list.filter((s) => modes.includes(s.mode!));
    if (slot.length) list = list.filter((s) => slot.includes(slotOf(s.depart!)));
  }
  list = [...list].sort((a, b) => (sort === "low" ? a.price - b.price : sort === "high" ? b.price - a.price : mins(a.duration) - mins(b.duration)));

  const nights = nightsBetween(search.checkIn, search.checkOut);
  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const tabLabel = { travel: "Travel", stays: "Stays", experiences: "Experiences" };

  return (
    <>
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 md:px-6">
          <span className="font-semibold">{search.from} → {search.to}</span>
          <span className="text-muted-foreground">{fmtDate(search.date)}</span>
          <span className="text-muted-foreground">{search.travellers} traveller{search.travellers > 1 ? "s" : ""}</span>
          {tab === "stays" && <span className="text-muted-foreground">Stay {fmtDate(search.checkIn)} – {fmtDate(search.checkOut)} · {search.rooms} room</span>}
          <button className="btn btn-outline ml-auto min-h-9 text-xs" onClick={() => setEditing(!editing)}>{editing ? "Close" : "Edit search"}</button>
        </div>
        {editing && <div className="mx-auto max-w-6xl px-4 pb-5 md:px-6"><SearchBar onDone={() => setEditing(false)} /></div>}
        <div className="mx-auto flex max-w-6xl overflow-x-auto px-4 md:px-6">
          {(Object.keys(tabLabel) as Tab[]).map((t) => (
            <Link key={t} to="/results" search={{ tab: t }} data-active={tab === t} className="min-w-32 border-b-2 border-transparent px-6 py-3 data-[active=true]:border-primary data-[active=true]:text-primary">
              <span className="block font-medium">{tabLabel[t]}</span>
              <span className="text-xs text-muted-foreground">{counts[t]} options</span>
            </Link>
          ))}
        </div>
      </div>
      <Page className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-3xl md:text-4xl">{tab === "travel" ? "Available transport" : tab === "stays" ? `Stays in ${search.to}` : `Experiences in ${search.to}`}</h1>
            <span className="eyebrow">{list.length} of {counts[tab]} options</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {([["low", "Price: Low to High"], ["high", "Price: High to Low"], ...(tab === "stays" ? [] : [["dur", "Duration: Shortest"]])] as [typeof sort, string][]).map(([k, l]) => (
              <button key={k} className="chip" data-active={sort === k} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
          <div className="mt-6 border">
            {list.length === 0 && <p className="bg-card p-10 text-center text-muted-foreground">No options match these filters.</p>}
            {list.map((s) => {
              const total = s.kind === "stay" ? s.price * search.rooms * nights : s.price * search.travellers;
              const sub = s.kind === "stay" ? `${inr(s.price)} per room per night · ${search.rooms} room · ${nights} nights` : `${inr(s.price)} per person · ${search.travellers} ${s.kind === "travel" ? "traveller" : "participant"}${search.travellers > 1 ? "s" : ""}`;
              return (
                <article key={s.id} className="grid gap-5 border-b bg-card p-5 last:border-b-0 md:grid-cols-[1fr_auto] md:p-7">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <KindIcon s={s} className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-sans text-lg font-semibold">{s.name}</h3>
                      <span className="badge text-muted-foreground">{s.kind === "travel" ? s.mode : s.provider}</span>
                      {s.rating && <span className="flex items-center gap-1 text-sm"><Star className="h-3.5 w-3.5 fill-current text-warning" />{s.rating}</span>}
                    </div>
                    {s.kind === "travel" ? (
                      <div className="mt-5 flex items-center gap-4">
                        <div><p className="font-serif text-2xl">{s.depart}</p><p className="text-xs text-muted-foreground">{s.from} · {fmtDate(search.date)}</p></div>
                        <div className="flex-1 text-center"><p className="font-mono text-xs text-muted-foreground">{s.duration}</p><div className="mt-1 h-px bg-foreground/40" /></div>
                        <div className="text-right"><p className="font-serif text-2xl">{s.arrive}{s.overnight && <sup className="ml-1 font-sans text-xs text-primary">+1</sup>}</p><p className="text-xs text-muted-foreground">{s.to}{s.overnight ? " · next day" : ""}</p></div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {s.location} · {s.kind === "stay" ? `${fmtDate(search.checkIn)} – ${fmtDate(search.checkOut)}` : `${s.start}–${s.end} · ${s.duration}`}
                        <br />{s.included.join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <p className="font-serif text-3xl">{inr(total)} <span className="font-sans text-sm text-muted-foreground">total</span></p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                    <Link to="/service/$id" params={{ id: s.id }} className="btn btn-ink mt-2 w-full md:w-36">CHOOSE</Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <aside className="panel h-fit p-6">
          <h2 className="font-sans text-lg font-semibold">Filter results</h2>
          <div className="mt-6">
            <div className="flex justify-between"><span className="eyebrow">{tab === "stays" ? "Price per night" : "Price per person"}</span><span className="font-mono text-xs">up to {inr(max)}</span></div>
            <input type="range" min={200} max={4100} step={100} value={max} onChange={(e) => setMax(+e.target.value)} className="mt-3 w-full accent-primary" />
          </div>
          {tab === "travel" && (
            <>
              <p className="eyebrow mt-6">Departure time</p>
              <div className="mt-3 flex flex-wrap gap-2">{["Morning", "Afternoon", "Evening"].map((x) => <button key={x} className="chip" data-active={slot.includes(x)} onClick={() => toggle(slot, x, setSlot)}>{x}</button>)}</div>
              <p className="eyebrow mt-6">Type</p>
              <div className="mt-3 flex flex-wrap gap-2">{(["Flight", "Train", "Bus"] as Mode[]).map((x) => <button key={x} className="chip" data-active={modes.includes(x)} onClick={() => toggle(modes, x, setModes)}>{x}</button>)}</div>
            </>
          )}
          <p className="mt-6 border-t pt-5 text-sm text-muted-foreground"><b className="text-foreground">Provider prices.</b> Totals are shown for your selected quantity. Availability and final terms are confirmed during booking.</p>
        </aside>
      </Page>
    </>
  );
}
