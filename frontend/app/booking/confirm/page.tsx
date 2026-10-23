import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
            Booking
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
            Confirm your booking
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
            Review your itinerary before confirming. Each item will be booked
            directly with its provider.
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
            {/* ── Left: itinerary placeholder ─────────────────── */}
            <div
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--white)",
                padding: "3rem 2rem",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.9rem",
                  color: "var(--ink-muted)",
                  marginBottom: "1.5rem",
                  lineHeight: 1.6,
                }}
              >
                Your itinerary is empty. Go back and select your travel
                options first.
              </p>
              <Link
                href="/itinerary"
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                  fontSize: "0.825rem",
                  letterSpacing: "0.04em",
                  color: "var(--white)",
                  backgroundColor: "var(--ink)",
                  padding: "0.7rem 1.5rem",
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Go to itinerary
              </Link>
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

                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.825rem",
                    color: "var(--ink-muted)",
                    marginBottom: "1.25rem",
                  }}
                >
                  No items selected yet.
                </p>

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
                      color: "var(--ink-muted)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    ₹0
                  </span>
                </div>

                {/* Confirm — disabled until items populated */}
                <button
                  disabled
                  style={{
                    display: "block",
                    width: "100%",
                    backgroundColor: "var(--ink-muted)",
                    color: "var(--white)",
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    border: "none",
                    padding: "0.9rem 0",
                    marginBottom: "0.75rem",
                    cursor: "not-allowed",
                  }}
                >
                  Confirm booking
                </button>

                <Link
                  href="/itinerary"
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
                  Back to itinerary
                </Link>

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
