"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, Suspense } from "react";

/* ─── Helpers ────────────────────────────────────────────────── */
function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(iso: string): string {
  const d = isoToDate(iso);
  if (!d) return "Select date";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/* ─── Calendar dropdown ──────────────────────────────────────── */
interface CalendarProps {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
  months: string[];
  days: string[];
}

function Calendar({ value, onChange, onClose, months, days }: CalendarProps) {
  const today = new Date();
  const selected = isoToDate(value);

  const [viewYear, setViewYear]   = useState(selected?.getFullYear()  ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth()     ?? today.getMonth());

  const daysInMonth  = getDaysInMonth(viewYear, viewMonth);
  const firstWeekDay = getFirstDayOfMonth(viewYear, viewMonth);

  /* build grid: leading empty cells + day numbers */
  const cells: (number | null)[] = [
    ...Array(firstWeekDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  /* pad to complete last row */
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function selectDay(day: number) {
    const chosen = new Date(viewYear, viewMonth, day);
    onChange(dateToIso(chosen));
    onClose();
  }
  function isPast(day: number): boolean {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0,0,0,0);
    const t = new Date(); t.setHours(0,0,0,0);
    return d < t;
  }
  function isSelected(day: number): boolean {
    if (!selected) return false;
    return selected.getFullYear() === viewYear &&
           selected.getMonth()    === viewMonth &&
           selected.getDate()     === day;
  }
  function isToday(day: number): boolean {
    return today.getFullYear() === viewYear &&
           today.getMonth()    === viewMonth &&
           today.getDate()     === day;
  }

  return (
    <div
      className="search-calendar search-panel"
      style={{
        position: "absolute",
        top: "calc(100% + 2px)",
        left: 0,
        zIndex: 200,
        backgroundColor: "var(--white)",
        border: "1px solid var(--border)",
        width: "280px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.1)",
        userSelect: "none",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Month nav ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); prevMonth(); }}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            width: "24px",
            height: "24px",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: "0.75rem",
            color: "var(--ink-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          ‹
        </button>

        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          {months[viewMonth] ?? ""} {viewYear}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); nextMonth(); }}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            width: "24px",
            height: "24px",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: "0.75rem",
            color: "var(--ink-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          ›
        </button>
      </div>

      {/* ── Day headers ───────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0.5rem 0.75rem 0.25rem",
          gap: "2px",
        }}
      >
        {days.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.08em",
              color: "var(--ink-muted)",
              padding: "0.25rem 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Day grid ──────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          padding: "0 0.75rem 0.75rem",
          gap: "2px",
        }}
      >
        {cells.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;

          const past     = isPast(day);
          const selected = isSelected(day);
          const today_   = isToday(day);

          return (
            <button
              key={day}
              disabled={past}
              onClick={() => selectDay(day)}
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: selected ? 600 : today_ ? 500 : 300,
                fontSize: "0.8rem",
                padding: "0.4rem 0",
                textAlign: "center",
                border: today_ && !selected ? "1px solid var(--border)" : "none",
                backgroundColor: selected ? "var(--ink)" : "transparent",
                color: past
                  ? "var(--ink-muted)"
                  : selected
                  ? "var(--white)"
                  : "var(--ink)",
                cursor: past ? "not-allowed" : "pointer",
                opacity: past ? 0.35 : 1,
                transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!past && !selected)
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cream-dark)";
              }}
              onMouseLeave={(e) => {
                if (!selected)
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* ── Quick picks ───────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "0.6rem 0.75rem",
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Today",    offset: 0 },
          { label: "Tomorrow", offset: 1 },
          { label: "+1 week",  offset: 7 },
          { label: "+1 month", offset: 30 },
        ].map(({ label, offset }) => {
          const d = new Date();
          d.setDate(d.getDate() + offset);
          return (
            <button
              key={label}
              onClick={() => { onChange(dateToIso(d)); onClose(); }}
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.7rem",
                padding: "0.25rem 0.6rem",
                border: "1px solid var(--border)",
                backgroundColor: "transparent",
                color: "var(--ink-soft)",
                cursor: "pointer",
                transition: "all 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--cream)";
                (e.currentTarget as HTMLElement).style.color = "var(--ink)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--ink-soft)";
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main SearchBar (inner, needs useSearchParams) ──────────── */
function SearchBarInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [from,       setFrom]       = useState(searchParams.get("from")       ?? "Visakhapatnam");
  const [to,         setTo]         = useState(searchParams.get("to")         ?? "Hyderabad");
  const [date,       setDate]       = useState(searchParams.get("date")       ?? todayIso());
  const [travellers, setTravellers] = useState(Number(searchParams.get("travellers") ?? 1));
  const [searchOptions, setSearchOptions] = useState<{ cities: string[]; months: string[]; days: string[] }>({ cities: [], months: [], days: [] });

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen,   setToOpen]   = useState(false);
  const [calOpen,  setCalOpen]  = useState(false);
  const [hovered,  setHovered]  = useState(false);

  const fromRef = useRef<HTMLDivElement>(null);
  const toRef   = useRef<HTMLDivElement>(null);
  const calRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/search/options")
      .then((response) => response.json())
      .then(setSearchOptions)
      .catch(() => setSearchOptions({ cities: [], months: [], days: [] }));
  }, []);

  /* Close all panels on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (fromRef.current && !fromRef.current.contains(e.target as Node)) setFromOpen(false);
      if (toRef.current   && !toRef.current.contains(e.target as Node))   setToOpen(false);
      if (calRef.current  && !calRef.current.contains(e.target as Node))  setCalOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSearch() {
    const params = new URLSearchParams({
      from, to, date,
      travellers: String(travellers),
      tab: "travel",
    });
    router.push(`/results?${params.toString()}`);
  }

  function swapCities() {
    setFrom(to);
    setTo(from);
  }

  /* ── Shared style objects ─────────────────────────────────── */
  const fieldLabel: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
    fontSize: "0.6rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-muted)",
    marginBottom: "0.3rem",
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 1px)",
    left: 0,
    zIndex: 200,
    backgroundColor: "var(--white)",
    border: "1px solid var(--border)",
    minWidth: "200px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    maxHeight: "240px",
    overflowY: "auto",
  };

  function CityButton({ city, selected, onSelect }: { city: string; selected: boolean; onSelect: () => void }) {
    return (
      <button
        onClick={onSelect}
        style={{
          display: "block",
          width: "100%",
          padding: "0.65rem 1rem",
          fontFamily: "var(--font-body)",
          fontWeight: selected ? 500 : 300,
          fontSize: "0.85rem",
          color: selected ? "var(--ink)" : "var(--ink-soft)",
          backgroundColor: selected ? "var(--cream)" : "transparent",
          border: "none",
          borderBottom: "1px solid var(--border)",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        {city}
      </button>
    );
  }

  return (
    <div
      className="search-bar"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
        border: "1px solid var(--border)",
        backgroundColor: "var(--white)",
        maxWidth: "860px",
        position: "relative",
      }}
    >
      {/* ── FROM ──────────────────────────────────────────── */}
      <div
        ref={fromRef}
        style={{
          padding: "0.875rem 1.25rem",
          borderRight: "1px solid var(--border)",
          position: "relative",
          cursor: "pointer",
        }}
        onClick={() => { setFromOpen(v => !v); setToOpen(false); setCalOpen(false); }}
      >
        <p style={fieldLabel}>From</p>
        <p style={{
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: "0.9rem",
          color: from ? "var(--ink)" : "var(--ink-muted)",
        }}>
          {from || "City or airport"}
        </p>

        {/* Swap button */}
        <button
          onClick={(e) => { e.stopPropagation(); swapCities(); }}
          title="Swap cities"
          style={{
            position: "absolute",
            right: "-11px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "22px",
            height: "22px",
            backgroundColor: "var(--white)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.65rem",
            color: "var(--ink-soft)",
            padding: 0,
            lineHeight: 1,
          }}
        >
          ⇄
        </button>

        {fromOpen && (
          <div className="search-dropdown" style={dropdownStyle}>
            {searchOptions.cities.filter(c => c !== to).map(city => (
              <CityButton
                key={city}
                city={city}
                selected={city === from}
                onSelect={() => { setFrom(city); setFromOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── TO ────────────────────────────────────────────── */}
      <div
        ref={toRef}
        style={{
          padding: "0.875rem 1.25rem",
          borderRight: "1px solid var(--border)",
          position: "relative",
          cursor: "pointer",
        }}
        onClick={() => { setToOpen(v => !v); setFromOpen(false); setCalOpen(false); }}
      >
        <p style={fieldLabel}>To</p>
        <p style={{
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: "0.9rem",
          color: to ? "var(--ink)" : "var(--ink-muted)",
        }}>
          {to || "City or airport"}
        </p>

        {toOpen && (
          <div className="search-dropdown" style={dropdownStyle}>
            {searchOptions.cities.filter(c => c !== from).map(city => (
              <CityButton
                key={city}
                city={city}
                selected={city === to}
                onSelect={() => { setTo(city); setToOpen(false); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── DATE ──────────────────────────────────────────── */}
      <div
        ref={calRef}
        style={{
          padding: "0.875rem 1.25rem",
          borderRight: "1px solid var(--border)",
          position: "relative",
          cursor: "pointer",
          backgroundColor: calOpen ? "var(--cream)" : "transparent",
          transition: "background-color 0.1s",
        }}
        onClick={() => { setCalOpen(v => !v); setFromOpen(false); setToOpen(false); }}
      >
        <p style={fieldLabel}>Date</p>
        <p style={{
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: "0.9rem",
          color: date ? "var(--ink)" : "var(--ink-muted)",
        }}>
          {formatDisplay(date)}
        </p>

        {calOpen && (
          <Calendar
            value={date}
            onChange={setDate}
            onClose={() => setCalOpen(false)}
            months={searchOptions.months}
            days={searchOptions.days}
          />
        )}
      </div>

      {/* ── TRAVELLERS ────────────────────────────────────── */}
      <div
        style={{
          padding: "0.875rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <p style={fieldLabel}>Travellers</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setTravellers(v => Math.max(1, v - 1))}
            style={{
              width: "20px", height: "20px",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: "0.9rem",
              color: "var(--ink-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              flexShrink: 0,
            }}
          >
            −
          </button>
          <span style={{
            fontFamily: "var(--font-body)",
            fontWeight: 500,
            fontSize: "0.9rem",
            color: "var(--ink)",
            minWidth: "80px",
            textAlign: "center",
          }}>
            {travellers} {travellers === 1 ? "Traveller" : "Travellers"}
          </span>
          <button
            onClick={() => setTravellers(v => Math.min(9, v + 1))}
            style={{
              width: "20px", height: "20px",
              border: "1px solid var(--border)",
              backgroundColor: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: "0.9rem",
              color: "var(--ink-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              flexShrink: 0,
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* ── SEARCH ────────────────────────────────────────── */}
      <button
        onClick={handleSearch}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          backgroundColor: hovered ? "var(--orange-hover)" : "var(--orange)",
          color: "var(--white)",
          border: "none",
          padding: "0 2rem",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: "0.875rem",
          letterSpacing: "0.04em",
          cursor: "pointer",
          transition: "background-color 0.15s",
          whiteSpace: "nowrap",
          minHeight: "56px",
        }}
      >
        Search
      </button>
    </div>
  );
}

/* ─── Public export — wrapped in Suspense ─────────────────────── */
export default function SearchBar() {
  return (
    <Suspense fallback={null}>
      <SearchBarInner />
    </Suspense>
  );
}
