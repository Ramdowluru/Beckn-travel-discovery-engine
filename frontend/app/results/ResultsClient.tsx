"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useMemo, useEffect, useRef } from "react";
import { ApiError, fetchSearch } from "@/lib/api";
import type { TransportOption, StayOption, ExperienceOption } from "@/lib/types";

/* ─── Constants ───────────────────────────────────────────────── */
const tabs = [
  { key: "travel",      label: "Travel" },
  { key: "stays",       label: "Stays" },
  { key: "experiences", label: "Experiences" },
];

const DEPARTURE_HOURS: Record<string, [number, number]> = {
  Morning:   [0,  12],
  Afternoon: [12, 17],
  Evening:   [17, 24],
};
const TYPE_MAP: Record<string, string> = { Flight: "Flight", Train: "Train", Bus: "Bus" };
const EXP_CATEGORIES = ["Food", "Culture", "Adventure", "History", "Nature", "Local"];
const AMENITY_OPTIONS = ["WiFi", "AC", "Free cancellation", "Parking", "Restaurant"];

/* ─── Helpers ─────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function parsePriceStr(s: string): number { return parseInt(s.replace(/[^\d]/g, ""), 10) || 0; }
function parseDurationMinutes(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+)\s*h)?(?:\s*(\d+)\s*m)?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function categoryDetailUrl(
  basePath: string,
  searchParams: URLSearchParams,
  tab: "stays" | "experiences",
  values: Record<string, string | number>,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("tab", tab);
  Object.entries(values).forEach(([key, value]) => params.set(key, String(value)));
  return `${basePath}?${params.toString()}`;
}

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

/* ─── Empty / loading states ──────────────────────────────────── */
function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "2.5rem", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.875rem", color: "var(--ink-muted)" }}>
        {message}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "2.5rem", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.875rem", color: "var(--ink-muted)" }}>
        Searching for options…
      </p>
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────── */
export default function ResultsClient() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const queryParamsRef = useRef(searchParams.toString());

  useEffect(() => {
    queryParamsRef.current = searchParams.toString();
  }, [searchParams]);

  const activeTab  = searchParams.get("tab")        ?? "travel";
  const fromCity   = searchParams.get("from")       ?? "";
  const toCity     = searchParams.get("to")         ?? "";
  const dateRaw    = searchParams.get("date")       ?? "";
  const travellers = searchParams.get("travellers") ?? "1";
  const dateDisplay = formatDate(dateRaw);
  const [checkIn, setCheckIn] = useState(searchParams.get("check_in") ?? dateRaw);
  const [checkOut, setCheckOut] = useState(searchParams.get("check_out") ?? "");
  const [rooms, setRooms] = useState(Number(searchParams.get("rooms") ?? 1));
  const [guests, setGuests] = useState(Number(searchParams.get("guests") ?? travellers));
  const [experienceDate, setExperienceDate] = useState(searchParams.get("experience_date") ?? dateRaw);
  const [participants, setParticipants] = useState(Number(searchParams.get("participants") ?? travellers));

  /* ── Fetched data ──────────────────────────────────────────── */
  const [loading,            setLoading]            = useState(true);
  const [transportOptions,   setTransportOptions]   = useState<TransportOption[]>([]);
  const [stayOptions,        setStayOptions]        = useState<StayOption[]>([]);
  const [experienceOptions,  setExperienceOptions]  = useState<ExperienceOption[]>([]);
  const [counts,             setCounts]             = useState({ transport: 0, stays: 0, experiences: 0 });
  const [partialResults,   setPartialResults]   = useState(false);
  const [transactionId,    setTransactionId]    = useState("");
  const [stayTransactionId, setStayTransactionId] = useState("");
  const [experienceTransactionId, setExperienceTransactionId] = useState("");
  const [searchError,        setSearchError        ] = useState("");
  const requestId = useRef(0);
  const hotelRequestId = useRef(0);
  const [hotelLoading, setHotelLoading] = useState(false);
  const [hotelError, setHotelError] = useState("");
  const experienceRequestId = useRef(0);
  const [experienceLoading, setExperienceLoading] = useState(false);
  const [experienceError, setExperienceError] = useState("");

  // Transport discovery starts immediately; hotel discovery has its own lifecycle below.
  /* eslint-disable react-hooks/set-state-in-effect -- Transport discovery starts a cancellable provider request and publishes its lifecycle state. */
  useEffect(() => {
    const currentRequestId = ++requestId.current;
    const controller = new AbortController();
    setLoading(true);
    setSearchError("");
    setTransportOptions([]);
    setCounts((current) => ({ ...current, transport: 0 }));
    setPartialResults(false);
    setTransactionId("");
    const params = new URLSearchParams({
      from: fromCity,
      to: toCity,
      date: dateRaw,
      travellers,
      tab: "travel",
    });
    fetchSearch(params, controller.signal)
      .then((data) => {
        if (currentRequestId !== requestId.current) return;
        setTransportOptions(data.transport   ?? []);
        setCounts((current) => ({ ...current, transport: data.counts?.transport ?? 0 }));
        setPartialResults(data.partial_results === true);
        setTransactionId(data.transaction_id);
      }).catch((error: unknown) => {
        if (controller.signal.aborted || currentRequestId !== requestId.current) return;
        setSearchError(error instanceof ApiError ? error.message : "Search failed. Please try again.");
      })
      .finally(() => {
        if (currentRequestId === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [fromCity, toCity, dateRaw, travellers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- Hotel discovery starts a cancellable provider request and publishes its lifecycle state. */
  useEffect(() => {
    const validCriteria = Boolean(
      toCity && checkIn && checkOut && checkOut > checkIn &&
      Number.isInteger(rooms) && rooms >= 1 && rooms <= 9 &&
      Number.isInteger(guests) && guests >= 1 && guests <= 18,
    );
    if (!validCriteria) {
      return;
    }

    const currentRequestId = ++hotelRequestId.current;
    const controller = new AbortController();
    setHotelLoading(true);
    setHotelError("");
    const params = new URLSearchParams({
      to: toCity,
      check_in: checkIn,
      check_out: checkOut,
      rooms: String(rooms),
      guests: String(guests),
      tab: "stays",
    });
    const nextUrl = new URLSearchParams(queryParamsRef.current);
    for (const [key, value] of params) nextUrl.set(key, value);
    nextUrl.set("tab", activeTab);
    queryParamsRef.current = nextUrl.toString();
    router.replace(`/results?${nextUrl.toString()}`);

    fetchSearch(params, controller.signal)
      .then((data) => {
        if (currentRequestId !== hotelRequestId.current) return;
        setStayOptions(data.stays ?? []);
        setStayTransactionId(data.transaction_id);
        setCounts((current) => ({ ...current, stays: data.counts?.stays ?? 0 }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentRequestId !== hotelRequestId.current) return;
        setHotelError(error instanceof ApiError ? error.message : "Hotel search failed. Please try again.");
        setStayOptions([]);
        setCounts((current) => ({ ...current, stays: 0 }));
      })
      .finally(() => {
        if (currentRequestId === hotelRequestId.current) setHotelLoading(false);
      });
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toCity, checkIn, checkOut, rooms, guests]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- Experience discovery starts a cancellable provider request and publishes its lifecycle state. */
  useEffect(() => {
    const validCriteria = Boolean(
      toCity && experienceDate &&
      Number.isInteger(participants) && participants >= 1 && participants <= 18,
    );
    if (!validCriteria) {
      return;
    }

    const currentRequestId = ++experienceRequestId.current;
    const controller = new AbortController();
    setExperienceLoading(true);
    setExperienceError("");
    const params = new URLSearchParams({
      to: toCity,
      date: dateRaw,
      travellers,
      experience_date: experienceDate,
      participants: String(participants),
      tab: "experiences",
    });

    fetchSearch(params, controller.signal)
      .then((data) => {
        if (currentRequestId !== experienceRequestId.current) return;
        setExperienceOptions(data.experiences ?? []);
        setExperienceTransactionId(data.transaction_id);
        setCounts((current) => ({ ...current, experiences: data.counts?.experiences ?? 0 }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || currentRequestId !== experienceRequestId.current) return;
        setExperienceError(error instanceof ApiError ? error.message : "Experience search failed. Please try again.");
        setExperienceOptions([]);
        setCounts((current) => ({ ...current, experiences: 0 }));
      })
      .finally(() => {
        if (currentRequestId === experienceRequestId.current) setExperienceLoading(false);
      });
    return () => controller.abort();
  }, [toCity, dateRaw, travellers, experienceDate, participants]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ── Derived max values ─────────────────────────────────────── */
  const TRANSPORT_MAX = useMemo(() =>
    transportOptions.length > 0 ? Math.max(...transportOptions.map((o) => o.priceNum)) : 10000,
  [transportOptions]);

  const STAY_MAX = useMemo(() =>
    stayOptions.length > 0 ? Math.max(...stayOptions.map((s) => parsePriceStr(s.pricePerNight))) : 10000,
  [stayOptions]);

  /* ── Transport filters ─────────────────────────────────────── */
  const [selTimes,  setSelTimes]  = useState<string[]>(searchParams.get("times")?.split(",").filter(Boolean) ?? []);
  const [selTypes,  setSelTypes]  = useState<string[]>(searchParams.get("types")?.split(",").filter(Boolean) ?? []);
  const [maxTPrice, setMaxTPrice] = useState(TRANSPORT_MAX);
  const [transportSort, setTransportSort] = useState<"none" | "priceAsc" | "priceDesc" | "duration">(
    (searchParams.get("transport_sort") as "none" | "priceAsc" | "priceDesc" | "duration") ?? "none",
  );

  /* ── Stay filters ──────────────────────────────────────────── */
  const [minRating, setMinRating] = useState(Number(searchParams.get("stay_rating") ?? 0));
  const [staySort,  setStaySort]  = useState<"none" | "asc" | "desc">(
    (searchParams.get("stay_sort") as "none" | "asc" | "desc") ?? "none",
  );
  const [selAmen,   setSelAmen]   = useState<string[]>(searchParams.get("stay_amenities")?.split("|").filter(Boolean) ?? []);
  const [maxSPrice, setMaxSPrice] = useState(STAY_MAX);

  /* ── Experience filter ─────────────────────────────────────── */
  const [activeCat, setActiveCat] = useState(searchParams.get("experience_category") ?? "Food");

  /* Sync slider maxima when data loads */
  // Results are fetched asynchronously; keep the user-controlled slider bounds aligned with new provider data.
  /* eslint-disable react-hooks/set-state-in-effect -- Provider data changes the numeric bounds of the controlled price sliders. */
  useEffect(() => { setMaxTPrice(TRANSPORT_MAX); }, [TRANSPORT_MAX]);
  // Results are fetched asynchronously; keep the user-controlled slider bounds aligned with new provider data.
  useEffect(() => { setMaxSPrice(STAY_MAX); }, [STAY_MAX]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ── Derived lists ─────────────────────────────────────────── */
  const filteredTransport = useMemo(() => {
    const filtered = transportOptions.filter((o) => {
      if (o.priceNum > maxTPrice) return false;
      if (selTypes.length > 0 && !selTypes.includes(o.type)) return false;
      if (selTimes.length > 0) {
        const h = parseInt(o.departure.split(":")[0], 10);
        if (!selTimes.some((t) => { const [lo, hi] = DEPARTURE_HOURS[t]; return h >= lo && h < hi; })) return false;
      }
      return true;
    });

    if (transportSort === "none") return filtered;

    return filtered
      .map((option, index) => ({ option, index }))
      .sort((a, b) => {
        if (transportSort === "duration") {
          const aDuration = parseDurationMinutes(a.option.duration);
          const bDuration = parseDurationMinutes(b.option.duration);
          if (aDuration === null && bDuration !== null) return 1;
          if (aDuration !== null && bDuration === null) return -1;
          if (aDuration !== null && bDuration !== null && aDuration !== bDuration) {
            return aDuration - bDuration;
          }
        } else {
          const aPrice = Number.isFinite(a.option.unitPrice) ? a.option.unitPrice : null;
          const bPrice = Number.isFinite(b.option.unitPrice) ? b.option.unitPrice : null;
          if (aPrice === null && bPrice !== null) return 1;
          if (aPrice !== null && bPrice === null) return -1;
          if (aPrice !== null && bPrice !== null && aPrice !== bPrice) {
            return transportSort === "priceAsc" ? aPrice - bPrice : bPrice - aPrice;
          }
        }
        return a.index - b.index;
      })
      .map(({ option }) => option);
  }, [transportOptions, selTypes, selTimes, maxTPrice, transportSort]);

  const filteredStays = useMemo(() => {
    let list = stayOptions.filter((s) => {
      if (parsePriceStr(s.pricePerNight) > maxSPrice) return false;
      if (minRating > 0 && parseFloat(s.rating) < minRating) return false;
      if (selAmen.length > 0 && !selAmen.every((a) => s.amenities.includes(a))) return false;
      return true;
    });
    if (staySort === "asc")  list = [...list].sort((a, b) => parsePriceStr(a.pricePerNight) - parsePriceStr(b.pricePerNight));
    if (staySort === "desc") list = [...list].sort((a, b) => parsePriceStr(b.pricePerNight) - parsePriceStr(a.pricePerNight));
    return list;
  }, [stayOptions, minRating, staySort, selAmen, maxSPrice]);

  const filteredExp = useMemo(() =>
    experienceOptions.filter((e) => e.category === activeCat),
  [experienceOptions, activeCat]);

  /* ── Toggle helpers ────────────────────────────────────────── */
  const toggle = <T,>(arr: T[], item: T) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  /* ── Tab switch ────────────────────────────────────────────── */
  function switchTab(tab: string) {
    const p = new URLSearchParams(queryParamsRef.current);
    p.set("tab", tab);
    queryParamsRef.current = p.toString();
    router.push(`/results?${p.toString()}`);
  }

  function updateListParam(key: string, values: string[]) {
    const p = new URLSearchParams(queryParamsRef.current);
    if (values.length > 0) p.set(key, values.join(key === "stay_amenities" ? "|" : ","));
    else p.delete(key);
    queryParamsRef.current = p.toString();
    router.replace(`/results?${p.toString()}`, { scroll: false });
  }

  function updateCategoryParam(key: string, value: string | number) {
    const p = new URLSearchParams(queryParamsRef.current);
    if (value === "" || value === 0) p.delete(key);
    else p.set(key, String(value));
    queryParamsRef.current = p.toString();
    router.replace(`/results?${p.toString()}`, { scroll: false });
  }

  /* ── Price slider track fill % ─────────────────────────────── */
  const tPct = TRANSPORT_MAX > 0 ? Math.round((maxTPrice / TRANSPORT_MAX) * 100) : 100;
  const sPct = STAY_MAX      > 0 ? Math.round((maxSPrice / STAY_MAX)      * 100) : 100;

  return (
    <>
      {/* ── Context bar ───────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
        <div className="results-context-inner" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            {fromCity && toCity && (
              <span style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.85rem", color: "var(--ink)" }}>
                {fromCity} → {toCity}
              </span>
            )}
            {(fromCity || toCity) && (
              <span style={{ width: "1px", height: "16px", backgroundColor: "var(--border)", display: "inline-block" }} />
            )}
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>
              {dateDisplay || "Any date"}
            </span>
            <span style={{ width: "1px", height: "16px", backgroundColor: "var(--border)", display: "inline-block" }} />
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>
              {travellers} {travellers === "1" ? "traveller" : "travellers"}
            </span>
          </div>
          <Link
            href={`/home?${(() => {
              const params = new URLSearchParams({
                from: fromCity,
                to: toCity,
                date: dateRaw,
                travellers,
              });
              for (const key of ["check_in", "check_out", "rooms", "guests", "experience_date", "participants"]) {
                const value = searchParams.get(key);
                if (value) params.set(key, value);
              }
              return params.toString();
            })()}`}
            style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.8rem", color: "var(--orange)", textDecoration: "none" }}
          >
            Edit search
          </Link>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
        <div className="results-tabs-inner" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", display: "flex" }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === "travel" ? counts.transport : tab.key === "stays" ? counts.stays : counts.experiences;
            return (
              <button key={tab.key} className="results-tab" onClick={() => switchTab(tab.key)} type="button" aria-pressed={isActive}
                style={{ background: "none", border: "none", borderBottom: isActive ? "2px solid var(--orange)" : "2px solid transparent", padding: "1rem 2rem 0.875rem", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s", marginBottom: "-1px" }}>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: isActive ? 600 : 400, fontSize: "0.875rem", color: isActive ? "var(--orange)" : "var(--ink-soft)", marginBottom: "0.15rem" }}>
                  {tab.label}
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                  {tab.key === "travel" && loading || tab.key === "stays" && hotelLoading || tab.key === "experiences" && experienceLoading
                    ? "…"
                    : `${count} options`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div className="results-body" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 2rem 4rem", display: "grid", gridTemplateColumns: activeTab === "experiences" ? "1fr" : "1fr 280px", gap: "2rem", alignItems: "start" }}>

        {/* ── Left: results ─────────────────────────────────── */}
        <div>

          {/* ════ TRAVEL TAB ════════════════════════════════════ */}
          {activeTab === "travel" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  Available transport
                </h2>
                {!loading && (
                  <span className="tag-neutral" style={{ fontSize: "0.65rem" }}>
                    {filteredTransport.length} of {transportOptions.length} options
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                {[["priceAsc", "Price: Low to High"], ["priceDesc", "Price: High to Low"], ["duration", "Duration: Shortest"]].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={transportSort === value} onClick={() => {
                    const next = transportSort === value ? "none" : value;
                    setTransportSort(next as typeof transportSort);
                    updateCategoryParam("transport_sort", next === "none" ? "" : next);
                  }} style={PILL(transportSort === value)}>{label}</button>
                ))}
              </div>

              {searchError ? <EmptyState message={searchError} /> : loading ? <LoadingState /> : (
                <>
                  {partialResults && (
                    <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink-soft)", backgroundColor: "var(--cream)", border: "1px solid var(--border)", padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                      Some providers did not respond. Results may be incomplete.
                    </p>
                  )}
                  {filteredTransport.length === 0 ? (
                <EmptyState message={transportOptions.length === 0
                  ? "No transport options found. Try a different route or date."
                  : "No transport options match your filters. Try adjusting the filters on the right."
                } />
                  ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "var(--border)" }}>
                  {filteredTransport.map((opt) => (
                    <div key={opt.id} className="transport-result" style={{ backgroundColor: "var(--white)", padding: "1.25rem 1.5rem", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "1.5rem" }}>
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
                        <div style={{ textAlign: "right" }}>
                          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>
                            {opt.currency} {opt.totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} total
                          </span>
                          <span style={{ display: "block", fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                            {opt.currency} {opt.unitPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per person · {opt.travellerCount} {opt.travellerCount === 1 ? "traveller" : "travellers"}
                          </span>
                        </div>
                        <Link href={`/results/transport/${encodeURIComponent(opt.id)}?transaction_id=${encodeURIComponent(transactionId)}`}
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
            </>
          )}

          {/* ════ STAYS TAB ════════════════════════════════════ */}
          {activeTab === "stays" && (
            <>
              <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1rem", marginBottom: "1.25rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.8rem", color: "var(--ink)", marginBottom: "0.75rem" }}>
                  Stay details in {toCity}
                </p>
                <div className="stay-criteria-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", alignItems: "end" }}>
                  <label>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>CHECK-IN</span>
                    <input type="date" value={checkIn} min={dateRaw} onChange={(event) => { setCheckIn(event.target.value); updateCategoryParam("check_in", event.target.value); }} style={{ width: "100%", border: "1px solid var(--border)", padding: "0.45rem", fontFamily: "var(--font-body)" }} />
                  </label>
                  <label>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>CHECK-OUT</span>
                    <input type="date" value={checkOut} min={checkIn || dateRaw} onChange={(event) => { setCheckOut(event.target.value); updateCategoryParam("check_out", event.target.value); }} style={{ width: "100%", border: "1px solid var(--border)", padding: "0.45rem", fontFamily: "var(--font-body)" }} />
                  </label>
                  <label>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>ROOMS</span>
                    <input type="number" min={1} max={9} value={rooms} onChange={(event) => { setRooms(Number(event.target.value)); updateCategoryParam("rooms", Number(event.target.value)); }} style={{ width: "100%", border: "1px solid var(--border)", padding: "0.45rem", fontFamily: "var(--font-body)" }} />
                  </label>
                  <label>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--ink-muted)", marginBottom: "0.3rem" }}>GUESTS</span>
                    <input type="number" min={1} max={18} value={guests} onChange={(event) => { setGuests(Number(event.target.value)); updateCategoryParam("guests", Number(event.target.value)); }} style={{ width: "100%", border: "1px solid var(--border)", padding: "0.45rem", fontFamily: "var(--font-body)" }} />
                  </label>
                </div>
                {!checkOut || checkOut <= checkIn ? (
                  <p style={{ marginTop: "0.75rem", fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                    Enter a check-out date after check-in to search stays.
                  </p>
                ) : null}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  {loading ? "Stays" : `${filteredStays.length} stays${toCity ? ` in ${toCity}` : ""}`}
                </h2>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-muted)", fontStyle: "italic" }}>
                  Handpicked hotels and homes
                </span>
              </div>

              {/* Filter pills */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
                <button type="button" aria-pressed={minRating === 4} onClick={() => {
                  const next = minRating === 4 ? 0 : 4;
                  setMinRating(next);
                  updateCategoryParam("stay_rating", next);
                }} style={PILL(minRating === 4)}>Rating 4+</button>
                <button type="button" aria-pressed={staySort === "asc"} onClick={() => {
                  const next = staySort === "asc" ? "none" : "asc";
                  setStaySort(next);
                  updateCategoryParam("stay_sort", next === "none" ? "" : next);
                }} style={PILL(staySort === "asc")}>Price: low to high</button>
                <button type="button" aria-pressed={selAmen.includes("Free cancellation")} onClick={() => {
                  const next = toggle(selAmen, "Free cancellation");
                  setSelAmen(next);
                  updateListParam("stay_amenities", next);
                }} style={PILL(selAmen.includes("Free cancellation"))}>Free cancellation</button>
              </div>

              {hotelError ? <EmptyState message={hotelError} /> : hotelLoading ? <LoadingState /> : filteredStays.length === 0 ? (
                <EmptyState message={stayOptions.length === 0
                  ? "No stays found for this destination."
                  : "No stays match your filters. Try adjusting the options on the right."
                } />
              ) : (
                <div className="results-stays-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", backgroundColor: "var(--border)", border: "1px solid var(--border)" }}>
                  {filteredStays.map((stay) => (
                    <div key={stay.id} style={{ backgroundColor: "var(--white)" }}>
                      <div style={{ width: "100%", aspectRatio: "4/3", overflow: "hidden", backgroundColor: "var(--cream-dark)" }}>
                        {stay.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={stay.image} alt={stay.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
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
                                          {stay.totalPrice}
                                          <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.72rem", color: "var(--ink-muted)", marginLeft: "0.25rem" }}>total</span>
                            </p>
                                        <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)" }}>{stay.pricePerNight} per night · {stay.nights} nights · {rooms} {rooms === 1 ? "room" : "rooms"}</p>
                          </div>
                          <Link href={categoryDetailUrl(
                            `/results/stays/${encodeURIComponent(stay.id)}`,
                            new URLSearchParams(searchParams.toString()),
                            "stays",
                            { transaction_id: stayTransactionId, rooms, guests, check_in: checkIn, check_out: checkOut },
                          )}
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
                  {experienceLoading ? "Searching experiences…" : `${counts.experiences} experiences`}
                </h2>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-muted)", fontStyle: "italic" }}>
                  {toCity}
                </span>
              </div>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)", marginBottom: "1.5rem" }}>
                Prices are shown per person and for the selected number of participants. Booking does not reserve a place or collect payment.
              </p>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                <label style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                  Date
                  <input type="date" value={experienceDate} onChange={(event) => { setExperienceDate(event.target.value); updateCategoryParam("experience_date", event.target.value); }}
                    style={{ display: "block", marginTop: "0.35rem", padding: "0.45rem", border: "1px solid var(--border)" }} />
                </label>
                <label style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                  Participants
                  <input type="number" min={1} max={18} value={participants} onChange={(event) => { setParticipants(Number(event.target.value)); updateCategoryParam("participants", Number(event.target.value)); }}
                    style={{ display: "block", marginTop: "0.35rem", padding: "0.45rem", border: "1px solid var(--border)", width: "7rem" }} />
                </label>
              </div>

              {/* Category pills */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "2rem" }}>
                {EXP_CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => {
                    setActiveCat(cat);
                    updateCategoryParam("experience_category", cat);
                  }} style={PILL(activeCat === cat)}>
                    {cat}
                  </button>
                ))}
              </div>

              {experienceError ? <EmptyState message={experienceError} /> : experienceLoading ? <LoadingState /> : filteredExp.length === 0 ? (
                <EmptyState message={experienceOptions.length === 0
                  ? "No experiences found for this destination."
                  : "No experiences in this category yet."
                } />
              ) : (
                <div className="results-experiences-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1px", backgroundColor: "var(--border)", border: "1px solid var(--border)" }}>
                  {filteredExp.map((exp) => (
                    <div key={exp.id} className="results-experience-card" style={{ backgroundColor: "var(--white)", display: "grid", gridTemplateColumns: "200px 1fr" }}>
                      <div style={{ overflow: "hidden", backgroundColor: "var(--cream-dark)" }}>
                        {exp.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={exp.image} alt={exp.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
                      </div>
                      <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                            <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)" }}>Hosted by {exp.provider}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--orange)", fontWeight: 500 }}>★ {exp.rating}</span>
                          </div>
                          <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem", color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: "0.25rem", lineHeight: 1.2 }}>{exp.name}</p>
                          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.35rem" }}>
                            {formatDate(exp.date)} · {exp.time} · {exp.duration}
                          </p>
                          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "1rem" }}>
                            {exp.meetingPoint} · {exp.availability} places available
                          </p>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>
                            {exp.totalPrice} total
                            <small style={{ display: "block", fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)" }}>{exp.price} · {participants} {participants === 1 ? "participant" : "participants"}</small>
                          </span>
                          <Link href={categoryDetailUrl(
                            `/results/experiences/${encodeURIComponent(exp.id)}`,
                            new URLSearchParams(searchParams.toString()),
                            "experiences",
                            { transaction_id: experienceTransactionId, participants, experience_date: experienceDate },
                          )}
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
                  <p className="tag-neutral">{activeTab === "travel" ? "Price per person" : "Price"}</p>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--ink-soft)" }}>
                    up to ₹{(activeTab === "travel" ? maxTPrice : maxSPrice).toLocaleString("en-IN")}
                  </span>
                </div>
                <div style={{ position: "relative", height: "2px", backgroundColor: "var(--border)", marginBottom: "0.5rem" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "2px", backgroundColor: "var(--orange)", width: `${activeTab === "travel" ? tPct : sPct}%` }} />
                </div>
                <input
                  type="range"
                  min={activeTab === "travel" ? 0 : 0}
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
                        <button key={t} onClick={() => { const next = toggle(selTimes, t); setSelTimes(next); updateListParam("times", next); }} style={PILL(selTimes.includes(t))}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: "1.75rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Type</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {["Flight", "Train", "Bus"].map((t) => (
                        <button key={t} onClick={() => { const next = toggle(selTypes, TYPE_MAP[t]); setSelTypes(next); updateListParam("types", next); }} style={PILL(selTypes.includes(TYPE_MAP[t]))}>
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
                        <button key={r} onClick={() => { const next = minRating === r ? 0 : r; setMinRating(next); updateCategoryParam("stay_rating", next); }} style={PILL(minRating === r)}>
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
                            onClick={() => { const next = toggle(selAmen, a); setSelAmen(next); updateListParam("stay_amenities", next); }}>
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
                  <strong style={{ color: "var(--ink)" }}>Provider prices.</strong>{" "}
                  Totals are shown for your selected quantity. Availability and final terms are confirmed during booking.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
