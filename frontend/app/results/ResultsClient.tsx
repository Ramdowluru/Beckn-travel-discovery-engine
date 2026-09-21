"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useMemo } from "react";
import {
  transportOptions,
  stayOptions,
  experienceOptions,
} from "@/lib/mockData";

/* ─── Constants ───────────────────────────────────────────────── */
const tabs = [
  { key: "travel",      label: "Travel",      count: "18 options", from: "from ₹950"         },
  { key: "stays",       label: "Stays",       count: "42 options", from: "from ₹2,200/night"  },
  { key: "experiences", label: "Experiences", count: "18 options", from: "from ₹500"          },
];

const DEPARTURE_HOURS: Record<string, [number, number]> = {
  Morning:   [0,  12],
  Afternoon: [12, 17],
  Evening:   [17, 24],
};
const TYPE_MAP: Record<string, string> = { Flight: "FLIGHT", Train: "TRAIN", Bus: "BUS" };
const TRANSPORT_MAX = Math.max(...transportOptions.map((o) => o.priceNum));
const STAY_MAX      = Math.max(...stayOptions.map((s) => parseInt(s.pricePerNight.replace(/[^\d]/g, ""))));
const EXP_CATEGORIES = ["Food", "Culture", "Adventure", "History", "Nature", "Local"];
const AMENITY_OPTIONS = ["WiFi", "AC", "Free cancellation", "Parking", "Restaurant"];

/* ─── Helpers ─────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function parsePriceStr(s: string): number { return parseInt(s.replace(/[^\d]/g, ""), 10); }

/* ─── Shared style snippets ───────────────────────────────────── */
const PILL = (active: boolean): React.CSSProperties => ({
  fontFamily: "var(--font-body)",
  fontWeight: 400,
  fontSize: "0.775rem",
  padding: "0.4rem 1rem",
  border: "1px solid var(--border)",
  backgroundColor: active ? "var(--ink)" : "transparent",
  color: active ? "var(--white)" : "var(--ink-soft)",
  cursor: "pointer",
  transition: "all 0.15s",
  letterSpacing: "0.01em",
});

/* ─── Empty state ─────────────────────────────────────────────── */
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "2.5rem", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.875rem", color: "var(--ink-muted)" }}>
        {message}
      </p>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────── */
export default function ResultsClient() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const activeTab  = searchParams.get("tab")        ?? "travel";
  const fromCity   = searchParams.get("from")       ?? "Visakhapatnam";
  const toCity     = searchParams.get("to")         ?? "Hyderabad";
  const dateRaw    = searchParams.get("date")       ?? "";
  const travellers = searchParams.get("travellers") ?? "1";
  const dateDisplay = formatDate(dateRaw);

  /* ── Transport filters ─────────────────────────────────────── */
  const [selTimes,   setSelTimes]   = useState<string[]>([]);
  const [selTypes,   setSelTypes]   = useState<string[]>([]);
  const [maxTPrice,  setMaxTPrice]  = useState(TRANSPORT_MAX);

  /* ── Stay filters ──────────────────────────────────────────── */
  const [minRating,  setMinRating]  = useState(0);
  const [staySort,   setStaySort]   = useState<"none" | "asc" | "desc">("none");
  const [selAmen,    setSelAmen]    = useState<string[]>([]);
  const [maxSPrice,  setMaxSPrice]  = useState(STAY_MAX);

  /* ── Experience filter ─────────────────────────────────────── */
  const [activeCat, setActiveCat]   = useState("Food");

  /* ── Derived lists ─────────────────────────────────────────── */
  const filteredTransport = useMemo(() => transportOptions.filter((o) => {
    if (o.priceNum > maxTPrice) return false;
    if (selTypes.length > 0 && !selTypes.includes(o.type)) return false;
    if (selTimes.length > 0) {
      const h = parseInt(o.departure.split(":")[0], 10);
      if (!selTimes.some((t) => { const [lo, hi] = DEPARTURE_HOURS[t]; return h >= lo && h < hi; })) return false;
    }
    return true;
  }), [selTypes, selTimes, maxTPrice]);

  const filteredStays = useMemo(() => {
    let list = stayOptions.filter((s) => {
      if (parsePriceStr(s.pricePerNight) > maxSPrice) return false;
      if (minRating > 0 && parseFloat(s.rating) < minRating) return false;
      if (selAmen.length > 0 && !selAmen.every((a) => s.amenities.includes(a))) return false;
      return true;
    });
    if (staySort === "asc") list = [...list].sort((a, b) => parsePriceStr(a.pricePerNight) - parsePriceStr(b.pricePerNight));
    if (staySort === "desc") list = [...list].sort((a, b) => parsePriceStr(b.pricePerNight) - parsePriceStr(a.pricePerNight));
    return list;
  }, [minRating, staySort, selAmen, maxSPrice]);

  const filteredExp = useMemo(() =>
    experienceOptions.filter((e) => e.category === activeCat),
  [activeCat]);

  /* ── Toggle helpers ────────────────────────────────────────── */
  const toggle = <T,>(arr: T[], item: T) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  /* ── Tab switch ────────────────────────────────────────────── */
  function switchTab(tab: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", tab);
    router.push(`/results?${p.toString()}`);
  }

  /* ── Price slider track fill % ─────────────────────────────── */
  const tPct = Math.round((maxTPrice / TRANSPORT_MAX) * 100);
  const sPct = Math.round((maxSPrice / STAY_MAX) * 100);

  return (
    <>
      {/* ── Context bar ───────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.85rem", color: "var(--ink)" }}>
              {fromCity} → {toCity}
            </span>
            <span style={{ width: "1px", height: "16px", backgroundColor: "var(--border)", display: "inline-block" }} />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>
              {dateDisplay || "Any date"}
            </span>
            <span style={{ width: "1px", height: "16px", backgroundColor: "var(--border)", display: "inline-block" }} />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>
              {travellers} {travellers === "1" ? "traveller" : "travellers"}
            </span>
          </div>
          <Link href={`/?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&date=${dateRaw}&travellers=${travellers}`}
            style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.8rem", color: "var(--orange)", textDecoration: "none" }}>
            Edit search
          </Link>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", display: "flex" }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => switchTab(tab.key)}
                style={{ background: "none", border: "none", borderBottom: isActive ? "2px solid var(--orange)" : "2px solid transparent", padding: "1rem 2rem 0.875rem", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s", marginBottom: "-1px" }}>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: isActive ? 600 : 400, fontSize: "0.875rem", color: isActive ? "var(--orange)" : "var(--ink-soft)", marginBottom: "0.15rem" }}>
                  {tab.label}
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                  {tab.count}, {tab.from}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 2rem 4rem", display: "grid", gridTemplateColumns: activeTab === "experiences" ? "1fr" : "1fr 280px", gap: "2rem", alignItems: "start" }}>

        {/* ── Left: results ─────────────────────────────────── */}
        <div>

          {/* ════ TRAVEL TAB ════════════════════════════════════ */}
          {activeTab === "travel" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  Available transport
                </h2>
                <span className="tag-neutral" style={{ fontSize: "0.65rem" }}>
                  {filteredTransport.length} of {transportOptions.length} options
                </span>
              </div>

              {filteredTransport.length === 0 ? (
                <EmptyState message="No transport options match your filters. Try adjusting the filters on the right." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "var(--border)" }}>
                  {filteredTransport.map((opt) => (
                    <div key={opt.id} style={{ backgroundColor: "var(--white)", padding: "1.25rem 1.5rem", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "1.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
                          <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>{opt.provider}</span>
                          <span className="tag-neutral" style={{ fontSize: "0.6rem" }}>{opt.type}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div>
                            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>{opt.departure}</p>
                            <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.725rem", color: "var(--ink-muted)" }}>{opt.departureCity}</p>
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ink-muted)" }}>{opt.duration} · {opt.stops}</span>
                            <div style={{ width: "100%", height: "1px", backgroundColor: "var(--border)", position: "relative" }}>
                              <div style={{ position: "absolute", right: 0, top: "-3px", width: "6px", height: "6px", backgroundColor: "var(--ink-soft)" }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>{opt.arrival}</p>
                            <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.725rem", color: "var(--ink-muted)" }}>{opt.arrivalCity}</p>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.75rem" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>{opt.price}</span>
                        <Link href={`/results/transport/${opt.id}`}
                          style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.775rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--white)", backgroundColor: "var(--ink)", padding: "0.55rem 1.25rem", textDecoration: "none", whiteSpace: "nowrap" }}>
                          Choose
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ════ STAYS TAB ════════════════════════════════════ */}
          {activeTab === "stays" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  {filteredStays.length} stays in {toCity}
                </h2>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-muted)", fontStyle: "italic" }}>
                  Handpicked hotels and homes
                </span>
              </div>

              {/* Filter pills */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
                <button onClick={() => setMinRating(minRating === 4 ? 0 : 4)} style={PILL(minRating === 4)}>Rating 4+</button>
                <button onClick={() => setStaySort(staySort === "asc" ? "none" : "asc")} style={PILL(staySort === "asc")}>Price: low to high</button>
                <button onClick={() => setSelAmen(toggle(selAmen, "Free cancellation"))} style={PILL(selAmen.includes("Free cancellation"))}>Free cancellation</button>
              </div>

              {filteredStays.length === 0 ? (
                <EmptyState message="No stays match your filters. Try adjusting the options on the right." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", backgroundColor: "var(--border)", border: "1px solid var(--border)" }}>
                  {filteredStays.map((stay) => (
                    <div key={stay.id} style={{ backgroundColor: "var(--white)" }}>
                      <div style={{ width: "100%", aspectRatio: "4/3", overflow: "hidden", backgroundColor: "var(--cream-dark)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={stay.image} alt={stay.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      <div style={{ padding: "1rem 1.1rem 1.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                          <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)" }}>{stay.provider}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--orange)", fontWeight: 500 }}>★ {stay.rating}</span>
                        </div>
                        <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem", color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: "0.2rem" }}>{stay.name}</p>
                        <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.75rem" }}>{stay.location}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "1rem" }}>
                          {stay.amenities.map((a) => (
                            <span key={a} style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.68rem", color: "var(--ink-soft)", backgroundColor: "var(--cream)", border: "1px solid var(--border)", padding: "0.15rem 0.5rem" }}>{a}</span>
                          ))}
                        </div>
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.875rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                          <div>
                            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.05rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>
                              {stay.pricePerNight}
                              <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.72rem", color: "var(--ink-muted)", marginLeft: "0.25rem" }}>/ night</span>
                            </p>
                            <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)" }}>{stay.totalPrice} total · {stay.nights} nights</p>
                          </div>
                          <Link href={`/results/stays/${stay.id}`}
                            style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--white)", backgroundColor: "var(--ink)", padding: "0.5rem 1rem", textDecoration: "none", whiteSpace: "nowrap" }}>
                            View stay
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ════ EXPERIENCES TAB ════════════════════════════════ */}
          {activeTab === "experiences" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  Experience the city
                </h2>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-muted)", fontStyle: "italic" }}>
                  Hosted by local guides
                </span>
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)", marginBottom: "1.5rem" }}>
                Guided tours and hands-on activities led by people who live here.
              </p>

              {/* Category pills — wired to filteredExp */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                {EXP_CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => setActiveCat(cat)} style={PILL(activeCat === cat)}>
                    {cat}
                  </button>
                ))}
              </div>

              {filteredExp.length === 0 ? (
                <EmptyState message="No experiences in this category yet." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1px", backgroundColor: "var(--border)", border: "1px solid var(--border)" }}>
                  {filteredExp.map((exp) => (
                    <div key={exp.id} style={{ backgroundColor: "var(--white)", display: "grid", gridTemplateColumns: "200px 1fr" }}>
                      <div style={{ overflow: "hidden", backgroundColor: "var(--cream-dark)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={exp.image} alt={exp.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)" }}>Hosted by {exp.provider}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--orange)", fontWeight: 500 }}>★ {exp.rating}</span>
                          </div>
                          <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem", color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: "0.25rem", lineHeight: 1.2 }}>{exp.name}</p>
                          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "1rem" }}>Duration: {exp.duration}</p>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>{exp.price}</span>
                          <Link href={`/results/experiences/${exp.id}`}
                            style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.75rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--white)", backgroundColor: "var(--ink)", padding: "0.5rem 1rem", textDecoration: "none", whiteSpace: "nowrap" }}>
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: filter panel (travel + stays only) ─────────── */}
        {(activeTab === "travel" || activeTab === "stays") && (
          <aside>
            <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "1.5rem" }}>
              <h3 style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.875rem", color: "var(--ink)", letterSpacing: "0.02em", marginBottom: "1.5rem" }}>
                Filter results
              </h3>

              {/* ── Price range ──────────────────────────────── */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
                  <p className="tag-neutral">Price</p>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--ink-soft)" }}>
                    up to ₹{activeTab === "travel" ? maxTPrice.toLocaleString("en-IN") : maxSPrice.toLocaleString("en-IN")}
                  </span>
                </div>
                {/* Custom slider track */}
                <div style={{ position: "relative", height: "2px", backgroundColor: "var(--border)", marginBottom: "0.5rem" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "2px", backgroundColor: "var(--orange)", width: `${activeTab === "travel" ? tPct : sPct}%` }} />
                </div>
                <input
                  type="range"
                  min={activeTab === "travel" ? 500 : 1000}
                  max={activeTab === "travel" ? TRANSPORT_MAX : STAY_MAX}
                  step={activeTab === "travel" ? 100 : 200}
                  value={activeTab === "travel" ? maxTPrice : maxSPrice}
                  onChange={(e) => activeTab === "travel"
                    ? setMaxTPrice(Number(e.target.value))
                    : setMaxSPrice(Number(e.target.value))
                  }
                  style={{ width: "100%", accentColor: "var(--orange)", cursor: "pointer", margin: 0 }}
                />
              </div>

              {/* ── Travel-specific filters ───────────────────── */}
              {activeTab === "travel" && (
                <>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Departure time</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {["Morning", "Afternoon", "Evening"].map((t) => (
                        <button key={t} onClick={() => setSelTimes(toggle(selTimes, t))} style={PILL(selTimes.includes(t))}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: "1.75rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Type</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {["Flight", "Train", "Bus"].map((t) => (
                        <button key={t} onClick={() => setSelTypes(toggle(selTypes, TYPE_MAP[t]))} style={PILL(selTypes.includes(TYPE_MAP[t]))}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── Stay-specific filters ─────────────────────── */}
              {activeTab === "stays" && (
                <>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Rating</p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {[3, 4, 4.5].map((r) => (
                        <button key={r} onClick={() => setMinRating(minRating === r ? 0 : r)} style={PILL(minRating === r)}>
                          ★ {r}+
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: "1.75rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Amenities</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {AMENITY_OPTIONS.map((a) => {
                        const on = selAmen.includes(a);
                        return (
                          <label key={a} style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}
                            onClick={() => setSelAmen(toggle(selAmen, a))}>
                            <div style={{ width: "14px", height: "14px", border: "1px solid var(--border)", backgroundColor: on ? "var(--ink)" : "transparent", flexShrink: 0, transition: "background-color 0.15s" }} />
                            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: on ? "var(--ink)" : "var(--ink-soft)" }}>{a}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* ── Trust note ────────────────────────────────── */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.775rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--ink)" }}>Book direct, save more.</strong>{" "}
                  No markup or hidden platform fees — the price you see is what the provider charges.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
