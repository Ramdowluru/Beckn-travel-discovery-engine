import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ConfirmationActions from "./ConfirmationActions";
import type { ExperienceOption, StayOption, TransportOption } from "@/lib/mockData";
import { serverApiFetch } from "@/lib/serverApi";
import { getSearchParam, getSelectionIds, type PageSearchParams } from "@/lib/searchParams";

/* ─── Dot style per segment ───────────────────────────────────── */
const dotStyle: Record<string, { bg: string; size: number; outline?: boolean }> = {
  DEPARTURE: { bg: "var(--ink)", size: 14 },
  FLIGHT:    { bg: "var(--ink)", size: 14 },
  STAY:      { bg: "var(--ink)", size: 14 },
  EXPERIENCE:{ bg: "var(--orange)", size: 14 },
  RETURN:    { bg: "transparent", size: 14, outline: true },
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatAmount(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function createReference(values: string[]): string {
  const input = values.join("|");
  let hash = 0;
  for (const character of input) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `TDE-${(values[1] || "TRIP").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "TRI"}-${(values[2] || "TRIP").replace(/-/g, "").slice(-6).toUpperCase()}-${hash.toString(36).toUpperCase().padStart(5, "0")}`;
}

export default async function ConfirmedTripPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const fromCity = getSearchParam(params, "from") || "Visakhapatnam";
  const toCity = getSearchParam(params, "to") || "Hyderabad";
  const date = getSearchParam(params, "date");
  const transportIds = getSelectionIds(params, "transports", "transport");
  const stayIds = getSelectionIds(params, "stays", "stay");
  const experienceIds = getSelectionIds(params, "experiences", "experience");
  const [transports, stays, experiences] = await Promise.all([
    Promise.all(transportIds.map((id) => serverApiFetch<TransportOption>(`/api/transport/${id}`).catch(() => undefined))),
    Promise.all(stayIds.map((id) => serverApiFetch<StayOption>(`/api/stays/${id}`).catch(() => undefined))),
    Promise.all(experienceIds.map((id) => serverApiFetch<ExperienceOption>(`/api/experiences/${id}`).catch(() => undefined))),
  ]).then(([transportResults, stayResults, experienceResults]) => [
    transportResults.filter((item): item is TransportOption => Boolean(item)),
    stayResults.filter((item): item is StayOption => Boolean(item)),
    experienceResults.filter((item): item is ExperienceOption => Boolean(item)),
  ] as const);
  const confirmedItems = [
    { id: "departure", type: "DEPARTURE", title: fromCity, detail: date ? `Trip starts on ${formatDate(date)}.` : "Trip started.", price: null },
    ...transports.map((transport) => ({ id: transport.id, type: transport.type, title: `${transport.provider} · ${transport.departureCity} → ${transport.arrivalCity}`, detail: `${transport.departure} → ${transport.arrival} · ${transport.duration}`, price: transport.price })),
    ...stays.map((stay) => ({ id: stay.id, type: "STAY", title: stay.name, detail: `${stay.nights} nights · Check-in ${stay.checkIn} → Check-out ${stay.checkOut}`, price: stay.totalPrice })),
    ...experiences.map((experience) => ({ id: experience.id, type: "EXPERIENCE", title: experience.name, detail: `${experience.duration} · Meet at ${experience.meetingPoint}`, price: experience.price })),
    { id: "return", type: "RETURN", title: `${toCity} trip`, detail: "Your confirmed travel plan.", price: null },
  ];
  const tripSummary = [
    ...transports.map((transport) => ({ label: `${transport.type} · ${transport.provider}`, amount: transport.price, value: transport.priceNum })),
    ...stays.map((stay) => ({ label: `${stay.name} · ${stay.nights} nights`, amount: stay.totalPrice, value: Number(stay.totalPrice.replace(/[^\d]/g, "")) })),
    ...experiences.map((experience) => ({ label: experience.name, amount: experience.price, value: experience.priceNum })),
  ];
  const totalPaid = tripSummary.reduce((sum, item) => sum + item.value, 0);
  const reference = createReference([
    fromCity,
    toCity,
    date,
    ...transports.map((item) => item.id),
    ...stays.map((item) => item.id),
    ...experiences.map((item) => item.id),
  ]);
  const shareText = `${fromCity} to ${toCity}${date ? ` on ${formatDate(date)}` : ""}. Booking reference: ${reference}. Total: ${formatAmount(totalPaid)}.`;

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "3.5rem 2rem 5rem",
          }}
        >
          {/* ── Page header ─────────────────────────────────────── */}
          <p
            className="tag"
            style={{ marginBottom: "0.75rem", color: "var(--orange)" }}
          >
            Confirmed trip
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              marginBottom: "0.5rem",
            }}
          >
            {date ? `${formatDate(date)}, ` : ""}{toCity}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "0.9rem",
              color: "var(--ink-soft)",
              marginBottom: "3rem",
              lineHeight: 1.6,
            }}
          >
            Booking confirmed. Here&apos;s your full schedule, tickets and hotel
            details.
          </p>

          {/* ── Two-column layout ───────────────────────────────── */}
          <div
            className="itinerary-layout"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 320px",
              gap: "3rem",
              alignItems: "start",
            }}
          >
            {/* ── Left: confirmed timeline ───────────────────── */}
            <div style={{ position: "relative" }}>
              {/* Spine */}
              <div
                style={{
                  position: "absolute",
                  left: "7px",
                  top: "8px",
                  bottom: "8px",
                  width: "1px",
                  backgroundColor: "var(--border)",
                  zIndex: 0,
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {confirmedItems.map((item, index) => {
                  const ds = dotStyle[item.type] ?? { bg: "var(--ink)", size: 14 };
                  const isLast = index === confirmedItems.length - 1;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "16px 1fr",
                        gap: "1.25rem",
                        paddingBottom: !isLast ? "2rem" : 0,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {/* Dot */}
                      <div
                        style={{
                          width: `${ds.size}px`,
                          height: `${ds.size}px`,
                          backgroundColor: ds.bg,
                          border: ds.outline ? "2px solid var(--ink-soft)" : "none",
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      />

                      {/* Content */}
                      <div>
                        <p
                          className="tag-neutral"
                          style={{ marginBottom: "0.3rem", fontSize: "0.6rem" }}
                        >
                          {item.type}
                        </p>
                        <p
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 600,
                            fontSize: "1.05rem",
                            color: "var(--ink)",
                            letterSpacing: "-0.01em",
                            marginBottom: item.detail && !isLast ? "0.5rem" : 0,
                          }}
                        >
                          {item.title}
                        </p>

                        {/* Detail box — only for non-final nodes with detail */}
                        {item.detail && (
                          <div
                            className="timeline-detail"
                            style={{
                              backgroundColor: isLast ? "transparent" : "var(--white)",
                              border: isLast ? "none" : "1px solid var(--border)",
                              padding: isLast ? "0.25rem 0 0" : "0.75rem 1rem",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-body)",
                                fontWeight: 300,
                                fontSize: "0.825rem",
                                color: isLast ? "var(--ink-muted)" : "var(--ink-soft)",
                              }}
                            >
                              {item.detail}
                            </span>
                            {item.price && (
                              <span
                                style={{
                                  fontFamily: "var(--font-display)",
                                  fontWeight: 600,
                                  fontSize: "0.95rem",
                                  color: "var(--ink)",
                                  letterSpacing: "-0.01em",
                                }}
                              >
                                {item.price}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Right: trip summary ─────────────────────────── */}
            <aside>
              <div
                style={{
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--white)",
                  padding: "1.75rem",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "1.1rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.01em",
                    marginBottom: "1.5rem",
                    paddingBottom: "1rem",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  Trip summary
                </h2>

                {/* Line items */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.875rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  {tripSummary.length === 0 ? (
                    <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                      No selections were included in this booking.
                    </p>
                  ) : tripSummary.map((item) => (
                    <div
                      className="price-row"
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 300,
                          fontSize: "0.825rem",
                          color: "var(--ink-soft)",
                          maxWidth: "180px",
                          lineHeight: 1.4,
                        }}
                      >
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          color: "var(--ink)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.amount}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total paid */}
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: "1.75rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 600,
                      fontSize: "0.9rem",
                      color: "var(--ink)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Total paid
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "1.4rem",
                      color: "var(--orange)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {formatAmount(totalPaid)}
                  </span>
                </div>

                <ConfirmationActions reference={reference} shareText={shareText} />

                {/* Modify booking link */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.78rem",
                    color: "var(--ink-muted)",
                    textAlign: "center",
                  }}
                >
                  Need changes?{" "}
                  <Link
                    href="/trips"
                    style={{
                      color: "var(--orange)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    Modify booking
                  </Link>
                </p>
              </div>

              {/* Booking reference tag */}
              <div
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 1rem",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--white)",
                }}
              >
                <p
                  className="tag-neutral"
                  style={{ marginBottom: "0.3rem", fontSize: "0.58rem" }}
                >
                  Booking reference
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    color: "var(--ink-soft)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {reference}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
