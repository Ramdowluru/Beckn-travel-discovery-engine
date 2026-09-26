import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SearchBar from "@/components/SearchBar";

/* ─── Data ────────────────────────────────────────────────────── */
const partnerStats = [
  { value: "18", label: "Transport partners" },
  { value: "42", label: "Hotels & stays" },
  { value: "18", label: "Local experiences" },
  { value: "0%", label: "Booking markup" },
];

const categories = [
  {
    key: "transport",
    label: "Flights & trains",
    description:
      "Compare airlines, railways and buses on one screen, sorted by price and time.",
    href: "/results?tab=travel",
    cta: "Search transport",
  },
  {
    key: "stays",
    label: "Hotels & stays",
    description:
      "From budget rooms to boutique stays, with free cancellation on most bookings.",
    href: "/results?tab=stays",
    cta: "Browse stays",
  },
  {
    key: "experiences",
    label: "Local experiences",
    description:
      "Guided walks, food tours and workshops hosted by local experts.",
    href: "/results?tab=experiences",
    cta: "Find experiences",
  },
];

const trustSignals = [
  {
    symbol: "✓",
    label: "Verified partners only",
    detail: "Every listing is checked before it goes live.",
  },
  {
    symbol: "₹",
    label: "Best price, no markup",
    detail: "You book directly with the provider — no hidden fees.",
  },
  {
    symbol: "↺",
    label: "Free cancellation",
    detail: "Most hotels and experiences can be cancelled for free.",
  },
  {
    symbol: "◎",
    label: "Support when you need it",
    detail: "Real help, 7 days a week, for every booking.",
  },
];

export default function PartnersPage() {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Hero section ──────────────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "5rem 2rem 3rem",
          }}
        >
          <p className="tag" style={{ marginBottom: "1.25rem" }}>
            Our Partners
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              marginBottom: "1.25rem",
              maxWidth: "580px",
            }}
          >
            Every ride, stay
            <br />
            and experience.
            <br />
            <em
              style={{
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--ink-soft)",
              }}
            >
              All in one search.
            </em>
          </h1>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "0.95rem",
              color: "var(--ink-soft)",
              lineHeight: 1.7,
              maxWidth: "460px",
              marginBottom: "2.5rem",
            }}
          >
            We work with trusted transport operators, hotels and local guides
            across India, so you can compare real options and book directly —
            no middlemen, no markup.
          </p>

          {/* Embedded search bar */}
          <SearchBar />
        </section>

        {/* ── Stats bar ─────────────────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem 4rem",
          }}
        >
          <div
            className="partners-stats-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--white)",
              maxWidth: "800px",
            }}
          >
            {partnerStats.map((stat, i) => (
              <div
                key={stat.label}
                style={{
                  padding: "1.25rem 1.5rem",
                  borderRight:
                    i < partnerStats.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "1.5rem",
                    color: i === 3 ? "var(--orange)" : "var(--ink)",
                    letterSpacing: "-0.02em",
                    marginBottom: "0.2rem",
                  }}
                >
                  {stat.value}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.75rem",
                    color: "var(--ink-muted)",
                  }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Book by category ──────────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem 4rem",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: "1.4rem",
                color: "var(--ink)",
                letterSpacing: "-0.02em",
                marginBottom: "0.25rem",
              }}
            >
              Book by category
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.825rem",
                color: "var(--ink-soft)",
              }}
            >
              Pick what you need — every option shown is a verified partner,
              ready to book directly.
            </p>
          </div>

          <div
            className="partners-category-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {categories.map((cat) => (
              <div
                key={cat.key}
                style={{
                  backgroundColor: "var(--white)",
                  padding: "2rem 1.75rem",
                }}
              >
                {/* Category label */}
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "1.1rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.01em",
                    marginBottom: "0.6rem",
                  }}
                >
                  {cat.label}
                </p>

                {/* Description */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.825rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.65,
                    marginBottom: "1.5rem",
                  }}
                >
                  {cat.description}
                </p>

                {/* CTA link */}
                <Link
                  href={cat.href}
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    color: "var(--orange)",
                    textDecoration: "none",
                    letterSpacing: "0.02em",
                    borderBottom: "1px solid var(--orange)",
                    paddingBottom: "1px",
                    transition: "opacity 0.15s",
                  }}
                >
                  {cat.cta} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust signals ─────────────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem 4rem",
          }}
        >
          <div
            className="partners-trust-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {trustSignals.map((ts, i) => (
              <div
                key={ts.label}
                style={{
                  backgroundColor: "var(--white)",
                  padding: "1.5rem 1.5rem",
                }}
              >
                {/* Symbol */}
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "1rem",
                    color: "var(--ink-soft)",
                    marginBottom: "0.75rem",
                    fontWeight: 400,
                  }}
                >
                  {ts.symbol}
                </p>

                {/* Label */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "var(--ink)",
                    marginBottom: "0.35rem",
                    lineHeight: 1.3,
                  }}
                >
                  {ts.label}
                </p>

                {/* Detail */}
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.775rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  {ts.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Social proof bar ──────────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem 5rem",
          }}
        >
          <div
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--white)",
              padding: "1.25rem 2rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.5rem",
                  color: "var(--ink)",
                  letterSpacing: "-0.02em",
                }}
              >
                4.6
              </span>
              <span
                style={{
                  color: "var(--orange)",
                  fontSize: "1rem",
                  letterSpacing: "0.1em",
                }}
              >
                ★★★★★
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.825rem",
                  color: "var(--ink-muted)",
                }}
              >
                Average rating across all partners
              </span>
            </div>

            <div
              style={{
                width: "1px",
                height: "32px",
                backgroundColor: "var(--border)",
              }}
            />

            <div>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                  color: "var(--ink)",
                  letterSpacing: "-0.01em",
                }}
              >
                12,400+
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.825rem",
                  color: "var(--ink-muted)",
                  marginLeft: "0.5rem",
                }}
              >
                trips booked this year
              </span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
