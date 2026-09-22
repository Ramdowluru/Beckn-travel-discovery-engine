import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { experienceOptions, stayOptions, transportOptions } from "@/lib/mockData";
import { buildSearchHref, getSearchParam, type PageSearchParams } from "@/lib/searchParams";

/* ─── Dot colour per segment type ────────────────────────────── */
const dotColor: Record<string, string> = {
  START: "var(--ink)",
  FLIGHT: "var(--ink)",
  STAY: "var(--ink)",
  EXPERIENCE: "var(--orange)",
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

export default async function ItineraryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const fromCity = getSearchParam(params, "from") || "Visakhapatnam";
  const toCity = getSearchParam(params, "to") || "Hyderabad";
  const date = getSearchParam(params, "date");
  const transport = transportOptions.find(
    (option) => option.id === getSearchParam(params, "transport"),
  );
  const stay = stayOptions.find(
    (option) => option.id === getSearchParam(params, "stay"),
  );
  const experience = experienceOptions.find(
    (option) => option.id === getSearchParam(params, "experience"),
  );

  const itineraryItems = [
    {
      id: "start",
      type: "START",
      title: `${fromCity} → ${toCity}`,
      detail: date ? `Departure on ${formatDate(date)}.` : "Departure point for your trip.",
      price: null,
    },
    ...(transport
      ? [{
          id: transport.id,
          type: transport.type,
          title: `${transport.provider} · ${transport.departureCity} → ${transport.arrivalCity}`,
          detail: `${transport.departure} → ${transport.arrival} · ${transport.duration}`,
          price: transport.price,
        }]
      : []),
    ...(stay
      ? [{
          id: stay.id,
          type: "STAY",
          title: stay.name,
          detail: `${stay.nights} nights · Check-in ${stay.checkIn} → Check-out ${stay.checkOut}`,
          price: stay.totalPrice,
        }]
      : []),
    ...(experience
      ? [{
          id: experience.id,
          type: "EXPERIENCE",
          title: experience.name,
          detail: `${experience.duration} · Meet at ${experience.meetingPoint}`,
          price: experience.price,
        }]
      : []),
  ];

  const priceBreakdown = [
    ...(transport ? [{ label: `${transport.type} · ${transport.provider}`, amount: transport.price, value: transport.priceNum }] : []),
    ...(stay ? [{ label: `${stay.name} · ${stay.nights} nights`, amount: stay.totalPrice, value: Number(stay.totalPrice.replace(/[^\d]/g, "")) }] : []),
    ...(experience ? [{ label: experience.name, amount: experience.price, value: experience.priceNum }] : []),
  ];
  const totalValue = priceBreakdown.reduce((sum, item) => sum + item.value, 0);
  const editParams = new URLSearchParams({
    tab: "travel",
    from: fromCity,
    to: toCity,
    ...(date ? { date } : {}),
    ...(getSearchParam(params, "travellers") ? { travellers: getSearchParam(params, "travellers") } : {}),
  });
  const checkoutHref = buildSearchHref("/booking/confirm", "travel", params, {
    ...(transport ? { transport: transport.id } : {}),
    ...(stay ? { stay: stay.id } : {}),
    ...(experience ? { experience: experience.id } : {}),
  });

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
          {/* ── Page header ────────────────────────────────────── */}
          <p className="tag" style={{ marginBottom: "0.75rem" }}>
            Your trip
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              marginBottom: "0.6rem",
            }}
          >
            Your itinerary
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "0.9rem",
              color: "var(--ink-soft)",
              marginBottom: "3rem",
              maxWidth: "480px",
              lineHeight: 1.6,
            }}
          >
            Everything you&apos;ve picked for your {toCity} trip, in one place.
            Review the details, then check out.
          </p>

          {/* ── Two-column layout ──────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 320px",
              gap: "3rem",
              alignItems: "start",
            }}
          >
            {/* ── Left: timeline ─────────────────────────────── */}
            <div style={{ position: "relative" }}>
              {/* Vertical spine line */}
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

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                }}
              >
                {itineraryItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "16px 1fr",
                      gap: "1.25rem",
                      paddingBottom: index < itineraryItems.length - 1 ? "2rem" : 0,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {/* Dot */}
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: dotColor[item.type] ?? "var(--ink)",
                        flexShrink: 0,
                        marginTop: "2px",
                      }}
                    />

                    {/* Content */}
                    <div>
                      {/* Segment type label */}
                      <p
                        className="tag-neutral"
                        style={{ marginBottom: "0.3rem", fontSize: "0.6rem" }}
                      >
                        {item.type}
                      </p>

                      {/* Title */}
                      <p
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 600,
                          fontSize: "1.05rem",
                          color: "var(--ink)",
                          letterSpacing: "-0.01em",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {item.title}
                      </p>

                      {/* Detail box */}
                      <div
                        style={{
                          backgroundColor: "var(--white)",
                          border: "1px solid var(--border)",
                          padding: "0.75rem 1rem",
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
                            color: "var(--ink-soft)",
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
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: price breakdown ─────────────────────── */}
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
                  Price breakdown
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
                  {priceBreakdown.length === 0 ? (
                    <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)", lineHeight: 1.5 }}>
                      Select travel, a stay, or an experience to build your itinerary.
                    </p>
                  ) : priceBreakdown.map((item) => (
                    <div
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

                {/* Total */}
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
                    Total
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
                    {formatAmount(totalValue)}
                  </span>
                </div>

                {/* Primary CTA */}
                <Link
                  href={checkoutHref}
                  style={{
                    display: "block",
                    width: "100%",
                    backgroundColor: "var(--ink)",
                    color: "var(--white)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                    textAlign: "center",
                    padding: "0.9rem 0",
                    marginBottom: "0.75rem",
                    transition: "background-color 0.15s",
                  }}
                >
                  Continue to checkout
                </Link>

                {/* Secondary CTA */}
                <Link
                  href={`/results?${editParams.toString()}`}
                  style={{
                    display: "block",
                    width: "100%",
                    backgroundColor: "transparent",
                    color: "var(--ink)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 400,
                    fontSize: "0.875rem",
                    letterSpacing: "0.04em",
                    textDecoration: "none",
                    textAlign: "center",
                    padding: "0.9rem 0",
                    border: "1px solid var(--border)",
                    marginBottom: "1.25rem",
                  }}
                >
                  Edit itinerary
                </Link>

                {/* Disclaimer */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.72rem",
                    color: "var(--ink-muted)",
                    lineHeight: 1.6,
                    textAlign: "center",
                  }}
                >
                  Includes all taxes and fees. You&apos;ll pay each provider
                  directly — no extra platform charge.
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
