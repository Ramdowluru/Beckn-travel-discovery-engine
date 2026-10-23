import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ─── Dot colour per segment type ────────────────────────────── */
const dotColor: Record<string, string> = {
  START:      "var(--ink)",
  FLIGHT:     "var(--ink)",
  TRAIN:      "var(--ink)",
  BUS:        "var(--ink)",
  STAY:       "var(--ink)",
  EXPERIENCE: "var(--orange)",
};

export default function ItineraryPage() {
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
            Select transport, a stay, and experiences from the results page to
            build your itinerary.
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
            {/* ── Left: empty timeline placeholder ───────────── */}
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
                Your itinerary is empty. Search for a trip and select your
                transport, stay, and experiences.
              </p>
              <Link
                href="/results?tab=travel"
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
                Browse transport
              </Link>
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

                {/* Empty breakdown */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.825rem",
                    color: "var(--ink-muted)",
                    marginBottom: "1.25rem",
                    lineHeight: 1.5,
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

                {/* Primary CTA — disabled until items are selected */}
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
                  Continue to checkout
                </button>

                {/* Secondary CTA */}
                <Link
                  href="/results?tab=travel"
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

/* Keep dotColor exported so future client components can reuse it */
export { dotColor };
