import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ─── Confirmed itinerary data ────────────────────────────────── */
const confirmedItems = [
  {
    id: "departure",
    type: "DEPARTURE",
    title: "Visakhapatnam (VTZ)",
    detail: "Trip started.",
    price: null,
  },
  {
    id: "flight-skyconnect",
    type: "FLIGHT",
    title: "SkyConnect · VTZ → HYD",
    detail: "08:20 → 10:00 · 1h 40m",
    price: "₹4,500",
  },
  {
    id: "stay-minerva",
    type: "STAY",
    title: "Hotel Minerva Grand",
    detail: "Check-in 15 Sep → Check-out 17 Sep",
    price: "₹5,600",
  },
  {
    id: "exp-charminar",
    type: "EXPERIENCE",
    title: "Charminar Heritage Walk",
    detail: "16 Sep, 16:00 · 3 hours",
    price: "₹500",
  },
  {
    id: "return",
    type: "RETURN",
    title: "Hotel checkout",
    detail: "17 Sep, 11:00 AM.",
    price: null,
  },
];

const tripSummary = [
  { label: "Flight · SkyConnect", amount: "₹4,500" },
  { label: "Hotel Minerva Grand · 2 nights", amount: "₹5,600" },
  { label: "Charminar Heritage Walk", amount: "₹500" },
];

const totalPaid = "₹10,600";

/* ─── Dot style per segment ───────────────────────────────────── */
const dotStyle: Record<string, { bg: string; size: number; outline?: boolean }> = {
  DEPARTURE: { bg: "var(--ink)", size: 14 },
  FLIGHT:    { bg: "var(--ink)", size: 14 },
  STAY:      { bg: "var(--ink)", size: 14 },
  EXPERIENCE:{ bg: "var(--orange)", size: 14 },
  RETURN:    { bg: "transparent", size: 14, outline: true },
};

export default function ConfirmedTripPage() {
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
            15 Sep – 17 Sep, Hyderabad
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
                  {tripSummary.map((item) => (
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
                    {totalPaid}
                  </span>
                </div>

                {/* Download tickets */}
                <button
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
                    border: "none",
                    padding: "0.9rem 0",
                    marginBottom: "0.75rem",
                    cursor: "pointer",
                    transition: "background-color 0.15s",
                  }}
                >
                  Download tickets
                </button>

                {/* Share trip */}
                <button
                  style={{
                    display: "block",
                    width: "100%",
                    backgroundColor: "transparent",
                    color: "var(--ink)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 400,
                    fontSize: "0.875rem",
                    letterSpacing: "0.04em",
                    border: "1px solid var(--border)",
                    padding: "0.9rem 0",
                    marginBottom: "1.25rem",
                    cursor: "pointer",
                    transition: "background-color 0.15s",
                  }}
                >
                  Share trip
                </button>

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
                  TDE-HYD-15SEP-0091A
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
