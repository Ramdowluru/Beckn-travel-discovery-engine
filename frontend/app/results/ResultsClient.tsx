"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { providerDateInIndia } from "@/lib/booking-dates";
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
const EXP_CATEGORIES = ["All", "Food", "Culture", "Adventure", "History", "Nature", "Local"];
const AMENITY_OPTIONS = ["WiFi", "AC", "Free cancellation", "Parking", "Restaurant"];

/* ─── Helpers ─────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  if (!iso) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}
function parsePriceStr(s: string): number { return parseInt(s.replace(/[^\d]/g, ""), 10) || 0; }
function parseMaximumPrice(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}
function parseDurationMinutes(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+)\s*h)?(?:\s*(\d+)\s*m)?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function transportArrivalDate(option: TransportOption): string {
  const timestamp = option._beckn?.fulfillment?.end?.time?.timestamp
    || option._beckn?.fulfillment?.end?.time?.range?.start;
  return option.arrivalDate || (timestamp ? providerDateInIndia(timestamp) : "");
}

function transportDepartureDate(option: TransportOption): string {
  const timestamp = option._beckn?.fulfillment?.start?.time?.timestamp
    || option._beckn?.fulfillment?.start?.time?.range?.start;
  return option.departureDate || (timestamp ? providerDateInIndia(timestamp) : "");
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
  const [experienceSort, setExperienceSort] = useState<"none" | "priceAsc" | "priceDesc" | "duration">(
    (searchParams.get("experience_sort") as "none" | "priceAsc" | "priceDesc" | "duration") ?? "none",
  );
  const [maxExperiencePrice, setMaxExperiencePrice] = useState(parseMaximumPrice(searchParams.get("max_experience_price"), 10000));

  // Transport discovery starts immediately; hotel discovery has its own lifecycle below.
  /* eslint-disable react-hooks/set-state-in-effect -- Transport discovery starts a cancellable provider request and publishes its lifecycle state. */
  useEffect(() => {
    const validCriteria = Boolean(
      fromCity.trim()
      && toCity.trim()
      && dateRaw
      && Number.isInteger(Number(travellers))
      && Number(travellers) >= 1
      && Number(travellers) <= 9,
    );
    if (!validCriteria) {
      ++requestId.current;
      setLoading(false);
      setSearchError("");
      setTransportOptions([]);
      setCounts((current) => ({ ...current, transport: 0 }));
      setPartialResults(false);
      setTransactionId("");
      return;
    }

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
      ++hotelRequestId.current;
      setStayOptions([]);
      setStayTransactionId("");
      setCounts((current) => ({ ...current, stays: 0 }));
      setHotelLoading(false);
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
      ++experienceRequestId.current;
      setExperienceOptions([]);
      setExperienceTransactionId("");
      setCounts((current) => ({ ...current, experiences: 0 }));
      setExperienceLoading(false);
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
  const [maxTPrice, setMaxTPrice] = useState(parseMaximumPrice(searchParams.get("max_transport_price"), 10000));
  const [transportSort, setTransportSort] = useState<"none" | "priceAsc" | "priceDesc" | "duration">(
    (searchParams.get("transport_sort") as "none" | "priceAsc" | "priceDesc" | "duration") ?? "none",
  );

  /* ── Stay filters ──────────────────────────────────────────── */
  const [minRating, setMinRating] = useState(Number(searchParams.get("stay_rating") ?? 0));
  const [staySort,  setStaySort]  = useState<"none" | "asc" | "desc">(
    (searchParams.get("stay_sort") as "none" | "asc" | "desc") ?? "none",
  );
  const [selAmen,   setSelAmen]   = useState<string[]>(searchParams.get("stay_amenities")?.split("|").filter(Boolean) ?? []);
  const [maxSPrice, setMaxSPrice] = useState(parseMaximumPrice(searchParams.get("max_stay_price"), 10000));

  /* ── Experience filter ─────────────────────────────────────── */
  const [activeCat, setActiveCat] = useState(searchParams.get("experience_category") ?? "All");

  /* Sync slider maxima when data loads */
  // Results are fetched asynchronously; keep the user-controlled slider bounds aligned with new provider data.
  /* eslint-disable react-hooks/set-state-in-effect -- Provider data changes the numeric bounds of the controlled price sliders. */
  useEffect(() => {
    const saved = searchParams.get("max_transport_price");
    setMaxTPrice(Math.min(parseMaximumPrice(saved, TRANSPORT_MAX), TRANSPORT_MAX));
  }, [TRANSPORT_MAX, searchParams]);
  // Results are fetched asynchronously; keep the user-controlled slider bounds aligned with new provider data.
  useEffect(() => {
    const saved = searchParams.get("max_stay_price");
    setMaxSPrice(Math.min(parseMaximumPrice(saved, STAY_MAX), STAY_MAX));
  }, [STAY_MAX, searchParams]);
  const EXPERIENCE_MAX = useMemo(() =>
    experienceOptions.length > 0 ? Math.max(...experienceOptions.map((option) => option.priceNum)) : 10000,
  [experienceOptions]);
  useEffect(() => {
    const saved = searchParams.get("max_experience_price");
    setMaxExperiencePrice(Math.min(parseMaximumPrice(saved, EXPERIENCE_MAX), EXPERIENCE_MAX));
  }, [EXPERIENCE_MAX, searchParams]);
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

  const filteredExp = useMemo(() => {
    const filtered = experienceOptions.filter((option) =>
      (activeCat === "All" || option.category === activeCat) && option.priceNum <= maxExperiencePrice,
    );
    if (experienceSort === "none") return filtered;
    return filtered
      .map((option, index) => ({ option, index }))
      .sort((a, b) => {
        if (experienceSort === "duration") {
          const aDuration = parseDurationMinutes(a.option.duration);
          const bDuration = parseDurationMinutes(b.option.duration);
          if (aDuration === null && bDuration !== null) return 1;
          if (aDuration !== null && bDuration === null) return -1;
          if (aDuration !== null && bDuration !== null && aDuration !== bDuration) return aDuration - bDuration;
        } else if (a.option.priceNum !== b.option.priceNum) {
          return experienceSort === "priceAsc"
            ? a.option.priceNum - b.option.priceNum
            : b.option.priceNum - a.option.priceNum;
        }
        return a.index - b.index;
      })
      .map(({ option }) => option);
  }, [experienceOptions, activeCat, maxExperiencePrice, experienceSort]);

  /* ── Toggle helpers ────────────────────────────────────────── */
  const toggle = <T,>(arr: T[], item: T) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  /* ── Tab switch ────────────────────────────────────────────── */
  function switchTab(tab: string) {
    const p = new URLSearchParams(queryParamsRef.current);
    if (tab === "stays" && !p.has("check_in")) {
      const availableArrivalDates = [...new Set(transportOptions.map(transportArrivalDate).filter(Boolean))];
      const arrivalDate = activeTab === "travel"
        ? availableArrivalDates.length === 1 ? availableArrivalDates[0] : ""
        : activeTab === "experiences"
          ? experienceDate
          : "";
      setCheckIn(arrivalDate);
      if (arrivalDate) p.set("check_in", arrivalDate);
    }
    if (tab === "experiences") {
      if (!p.has("experience_date")) {
        const sharedDate = activeTab === "stays" ? checkIn : dateRaw;
        setExperienceDate(sharedDate);
        if (sharedDate) p.set("experience_date", sharedDate);
      }
      if (!p.has("participants")) {
        const sharedCount = activeTab === "stays" ? guests : Number(travellers);
        setParticipants(sharedCount);
        p.set("participants", String(sharedCount));
      }
    }
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
      <div aria-label="Current search" role="region" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
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
      <div aria-label="Search categories" role="group" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
        <div className="results-tabs-inner" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", display: "flex" }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === "travel" ? counts.transport : tab.key === "stays" ? counts.stays : counts.experiences;
            return (
              <button key={tab.key} className="results-tab" onClick={() => switchTab(tab.key)} type="button" aria-pressed={isActive}
                aria-label={`${tab.label}${count ? `, ${count} options` : ""}`}
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
      <div className="results-body" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 2rem 4rem", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "2rem", alignItems: "start" }}>

        {/* ── Left: results ─────────────────────────────────── */}
        <div>

          {/* ════ TRAVEL TAB ════════════════════════════════════ */}
          {activeTab === "travel" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
                <h1 className="results-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  Available transport
                </h1>
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
                <div className="results-card-list" style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "var(--border)" }}>
                  {filteredTransport.map((opt) => (
                    <article key={opt.id} className="transport-result" style={{ backgroundColor: "var(--white)", padding: "1.25rem 1.5rem", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "1.5rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
                          <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>{opt.provider}</span>
                          <span className="tag-neutral" style={{ fontSize: "0.6rem" }}>{opt.type}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div>
                            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>{opt.departure} IST</p>
                            <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.725rem", color: "var(--ink-muted)" }}>{opt.departureCity}{transportDepartureDate(opt) ? ` · ${formatDate(transportDepartureDate(opt))}` : ""}</p>
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ink-muted)" }}>{opt.duration} · {opt.stops}</span>
                            <div style={{ width: "100%", height: "1px", backgroundColor: "var(--border)", position: "relative" }}>
                              <div style={{ position: "absolute", right: 0, top: "-3px", width: "6px", height: "6px", backgroundColor: "var(--ink-soft)" }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>{opt.arrival} IST</p>
                            <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.725rem", color: "var(--ink-muted)" }}>{opt.arrivalCity}{transportArrivalDate(opt) ? ` · ${formatDate(transportArrivalDate(opt))}` : ""}</p>
                          </div>
                        </div>
                      </div>
                      <div className="transport-result-side" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.75rem" }}>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.2rem", color: "var(--ink)", letterSpacing: "-0.01em" }}>
                            {opt.currency} {opt.totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} total
                          </span>
                          <span style={{ display: "block", fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.7rem", color: "var(--ink-muted)", marginTop: "0.2rem" }}>
                            {opt.currency} {opt.unitPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per person · {opt.travellerCount} {opt.travellerCount === 1 ? "traveller" : "travellers"}
                          </span>
                        </div>
                        <Link href={`/results/transport/${encodeURIComponent(opt.id)}?transaction_id=${encodeURIComponent(transactionId)}`}
                          aria-label={`View ${opt.provider} ${opt.type} option`}
                          style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.775rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--white)", backgroundColor: "var(--ink)", padding: "0.55rem 1.25rem", textDecoration: "none", whiteSpace: "nowrap" }}>
                          Choose
                        </Link>
                      </div>
                    </article>
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
                    {checkIn
                      ? "Enter a check-out date after check-in to search stays."
                      : "Choose the destination arrival date, then enter a check-out date to search stays."}
                  </p>
                ) : null}
              </div>
              <div className="stay-results-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                <h1 className="results-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  {loading ? "Stays" : `${filteredStays.length} stays${toCity ? ` in ${toCity}` : ""}`}
                </h1>
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
                <div className="results-stays-grid">
                  {filteredStays.map((stay) => (
                    <article key={stay.id} className="stay-result-row">
                      <div className="stay-result-image">
                        {stay.image ? (
                          <img src={stay.image} alt={stay.name} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)", color: "#999", fontSize: "0.8rem" }}>
                            No image
                          </div>
                        )}
                      </div>
                      <div className="stay-result-copy">
                        <div className="stay-result-heading">
                          <span className="stay-result-icon" aria-hidden="true">⌂</span>
                          <h2>{stay.name}</h2>
                          <span className="stay-result-provider">{stay.provider}</span>
                        </div>
                        <div className="stay-result-meta">
                          <span className="stay-result-rating">★ {stay.rating}</span>
                          <span>{stay.location} · {checkIn || "Check-in date"} – {checkOut || "Check-out date"}</span>
                        </div>
                        <p className="stay-result-amenities">{stay.amenities.join(" · ")}</p>
                      </div>
                      <div className="stay-result-price">
                        <p><strong>{stay.totalPrice}</strong> <span>total</span></p>
                        <small>{stay.pricePerNight} per room per night · {rooms} {rooms === 1 ? "room" : "rooms"} · {stay.nights} nights</small>
                        <Link href={categoryDetailUrl(
                          `/results/stays/${encodeURIComponent(stay.id)}`,
                          new URLSearchParams(searchParams.toString()),
                          "stays",
                          { transaction_id: stayTransactionId, rooms, guests, check_in: checkIn, check_out: checkOut },
                        )}>
                          Choose
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ════ EXPERIENCES TAB ════════════════════════════════ */}
          {activeTab === "experiences" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                <h1 className="results-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.4rem", color: "var(--ink)", letterSpacing: "-0.02em" }}>
                  {experienceLoading ? "Searching experiences…" : `${counts.experiences} experiences`}
                </h1>
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
                  <button key={cat} type="button" aria-pressed={activeCat === cat} onClick={() => {
                    setActiveCat(cat);
                    updateCategoryParam("experience_category", cat);
                  }} style={PILL(activeCat === cat)}>
                    {cat}
                  </button>
                ))}
              </div>

              <div className="experience-sort-controls" aria-label="Sort experiences">
                <button type="button" aria-pressed={experienceSort === "priceDesc"} onClick={() => {
                  const next = experienceSort === "priceDesc" ? "none" : "priceDesc";
                  setExperienceSort(next);
                  updateCategoryParam("experience_sort", next);
                }} style={PILL(experienceSort === "priceDesc")}>Price: high to low</button>
                <button type="button" aria-pressed={experienceSort === "priceAsc"} onClick={() => {
                  const next = experienceSort === "priceAsc" ? "none" : "priceAsc";
                  setExperienceSort(next);
                  updateCategoryParam("experience_sort", next);
                }} style={PILL(experienceSort === "priceAsc")}>Price: low to high</button>
                <button type="button" aria-pressed={experienceSort === "duration"} onClick={() => {
                  const next = experienceSort === "duration" ? "none" : "duration";
                  setExperienceSort(next);
                  updateCategoryParam("experience_sort", next);
                }} style={PILL(experienceSort === "duration")}>Duration: shortest</button>
              </div>

              {experienceError ? <EmptyState message={experienceError} /> : experienceLoading ? <LoadingState /> : filteredExp.length === 0 ? (
                <EmptyState message={experienceOptions.length === 0
                  ? "No experiences found for this destination."
                  : "No experiences match your filters. Try another category or price range."
                } />
              ) : (
                <div className="results-experiences-grid">
                  {filteredExp.map((exp) => (
                    <article key={exp.id} className="experience-result-row">
                      <div className="experience-result-image">
                        {exp.image ? (
                          <img src={exp.image} alt={exp.name} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)", color: "#999", fontSize: "0.8rem" }}>
                            No image
                          </div>
                        )}
                      </div>
                      <div className="experience-result-copy">
                        <div className="experience-result-heading">
                          <span className="experience-result-icon" aria-hidden="true">✣</span>
                          <h2>{exp.name}</h2>
                          <span className="experience-result-category">{exp.category} experience</span>
                        </div>
                        <div className="experience-result-meta">
                          <span className="experience-result-rating">★ {exp.rating}</span>
                          <span>{formatDate(exp.date)} · {exp.time} · {exp.duration}</span>
                        </div>
                        <p className="experience-result-location">{exp.meetingPoint} · {exp.availability} places available</p>
                      </div>
                      <div className="experience-result-price">
                        <p><strong>{exp.totalPrice}</strong> <span>total</span></p>
                        <small>{exp.price} per participant · {participants} {participants === 1 ? "participant" : "participants"}</small>
                        <Link href={categoryDetailUrl(
                          `/results/experiences/${encodeURIComponent(exp.id)}`,
                          new URLSearchParams(searchParams.toString()),
                          "experiences",
                          { transaction_id: experienceTransactionId, participants, experience_date: experienceDate },
                        )}>Choose</Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: filter panel (travel + stays only) ─────────── */}
        {(activeTab === "travel" || activeTab === "stays" || activeTab === "experiences") && (
          <aside>
            <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "1.5rem" }}>
              <h3 style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.875rem", color: "var(--ink)", letterSpacing: "0.02em", marginBottom: "1.5rem" }}>
                Filter results
              </h3>

              {/* ── Price range ──────────────────────────────── */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
                  <p className="tag-neutral">{activeTab === "travel" ? "Price per person" : activeTab === "stays" ? "Price per night" : "Price per participant"}</p>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "var(--ink-soft)" }}>
                    up to ₹{(activeTab === "travel" ? maxTPrice : activeTab === "stays" ? maxSPrice : maxExperiencePrice).toLocaleString("en-IN")}
                  </span>
                </div>
                <div style={{ position: "relative", height: "2px", backgroundColor: "var(--border)", marginBottom: "0.5rem" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "2px", backgroundColor: "var(--orange)", width: `${activeTab === "travel" ? tPct : sPct}%` }} />
                </div>
                <input
                  type="range"
                  min={activeTab === "travel" ? 0 : 0}
                  max={activeTab === "travel" ? TRANSPORT_MAX : activeTab === "stays" ? STAY_MAX : EXPERIENCE_MAX}
                  step={activeTab === "travel" ? 100 : 200}
                  value={activeTab === "travel" ? maxTPrice : activeTab === "stays" ? maxSPrice : maxExperiencePrice}
                  onChange={(e) => activeTab === "travel"
                    ? (setMaxTPrice(Number(e.target.value)), updateCategoryParam("max_transport_price", Number(e.target.value)))
                    : activeTab === "stays"
                      ? (setMaxSPrice(Number(e.target.value)), updateCategoryParam("max_stay_price", Number(e.target.value)))
                      : (setMaxExperiencePrice(Number(e.target.value)), updateCategoryParam("max_experience_price", Number(e.target.value)))
                  }
                  aria-label={activeTab === "travel" ? "Maximum transport price per person" : activeTab === "stays" ? "Maximum stay price per night" : "Maximum experience price per participant"}
                  aria-valuetext={`Up to ₹${(activeTab === "travel" ? maxTPrice : activeTab === "stays" ? maxSPrice : maxExperiencePrice).toLocaleString("en-IN")}`}
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
