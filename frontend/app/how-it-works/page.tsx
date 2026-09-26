import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ─── Steps data ──────────────────────────────────────────────── */
const steps = [
  {
    index: "01",
    title: "Search once",
    body: "Enter your origin, destination, travel date and number of travellers. TDE broadcasts your query across the entire Beckn provider network — transport operators, hotels and local guide guilds — simultaneously.",
  },
  {
    index: "02",
    title: "Discover options",
    body: "Results come back from every connected provider in real time. Compare flights, trains and buses side by side on the Travel tab. Switch to Stays or Experiences to see accommodation and activity options at your destination.",
  },
  {
    index: "03",
    title: "Build your journey",
    body: "Select a transport option, a place to stay, and any local experiences you want. TDE composes them into a single unified itinerary — one view, three separate provider contracts.",
  },
  {
    index: "04",
    title: "Review and check out",
    body: "Your itinerary shows the full price breakdown before you confirm. No hidden platform fees. The total you see is the sum of what each provider charges directly.",
  },
  {
    index: "05",
    title: "Book directly",
    body: "When you confirm, TDE sends the booking request to each provider through the Beckn protocol. You receive confirmation and tickets from each provider independently. Your contracts are with the providers — not with TDE.",
  },
];

/* ─── FAQ data ────────────────────────────────────────────────── */
const faqs = [
  {
    q: "What is the Beckn Protocol?",
    a: "Beckn is an open standard for decentralized commerce. It lets any buyer-side application (like TDE) discover and transact with any seller-side platform (like an airline or hotel) without needing a custom point-to-point integration. Think of it like HTTP for commerce.",
  },
  {
    q: "Does TDE add any markup to prices?",
    a: "No. TDE operates as a Beckn Application Platform (BAP) — we connect you to providers but we are not a reseller. You pay the provider directly at the price they advertise. Our commission is 0%.",
  },
  {
    q: "What happens if I need to cancel?",
    a: "Cancellation policies are set by each individual provider and are shown on every detail page before you book. TDE does not control refund terms — you deal directly with the provider.",
  },
  {
    q: "Are the providers real?",
    a: "In the current version the platform uses simulated provider data (Demo Air, Demo Bus, Demo Hotel etc.) to demonstrate the full Beckn discovery and booking lifecycle. The architecture is designed to connect to real BPPs when they are available.",
  },
  {
    q: "Is my payment processed through TDE?",
    a: "No. Payment flows directly between you and each provider. TDE never handles or stores payment information.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "5rem 2rem 4rem" }}>
          <p className="tag" style={{ marginBottom: "1.25rem" }}>How it works</p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              maxWidth: "600px",
              marginBottom: "1.5rem",
            }}
          >
            One search.
            <br />
            <em style={{ fontStyle: "italic", fontWeight: 400, color: "var(--ink-soft)" }}>
              Every provider.
            </em>
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "1rem",
              color: "var(--ink-soft)",
              lineHeight: 1.7,
              maxWidth: "520px",
            }}
          >
            TDE is built on the Beckn Protocol — an open standard that lets
            independent transport operators, hotels and local guides connect to
            a single discovery and booking interface without going through a
            centralised intermediary.
          </p>
        </section>

        {/* ── Steps ────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {steps.map((step) => (
              <div
                className="how-step"
                key={step.index}
                style={{
                  backgroundColor: "var(--white)",
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 0,
                }}
              >
                {/* Index */}
                <div
                  style={{
                    backgroundColor: "var(--ink)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem 1rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "1.1rem",
                      color: "rgba(242,237,228,0.3)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {step.index}
                  </span>
                </div>

                {/* Content */}
                <div style={{ padding: "2rem 2.5rem" }}>
                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: "1.2rem",
                      color: "var(--ink)",
                      letterSpacing: "-0.02em",
                      marginBottom: "0.6rem",
                    }}
                  >
                    {step.title}
                  </h2>
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 300,
                      fontSize: "0.9rem",
                      color: "var(--ink-soft)",
                      lineHeight: 1.75,
                      maxWidth: "640px",
                    }}
                  >
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Protocol flow diagram ─────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem 5rem",
          }}
        >
          <p className="tag-neutral" style={{ marginBottom: "1.25rem" }}>
            [BECKN-TRANSACTION-FLOW]
          </p>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "1.4rem",
              color: "var(--ink)",
              letterSpacing: "-0.02em",
              marginBottom: "2rem",
            }}
          >
            The Beckn lifecycle
          </h2>

          <div
            className="how-lifecycle-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {[
              { step: "search / on_search", desc: "TDE broadcasts your intent. Providers respond asynchronously with matching offers." },
              { step: "select / on_select", desc: "You pick an option. The provider confirms it is still available and returns final terms." },
              { step: "init / on_init",     desc: "TDE sends passenger and payment details to begin the order." },
              { step: "confirm / on_confirm", desc: "The provider finalises the booking and returns a confirmed order." },
            ].map((item, i) => (
              <div key={i} style={{ backgroundColor: "var(--white)", padding: "1.5rem" }}>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    color: "var(--orange)",
                    letterSpacing: "0.06em",
                    marginBottom: "0.75rem",
                    lineHeight: 1.5,
                  }}
                >
                  {item.step}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.825rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.65,
                  }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 5rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "1.4rem",
              color: "var(--ink)",
              letterSpacing: "-0.02em",
              marginBottom: "1.5rem",
            }}
          >
            Frequently asked
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {faqs.map((faq) => (
              <div
                key={faq.q}
                style={{
                  backgroundColor: "var(--white)",
                  padding: "1.5rem 1.75rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: "2rem",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 500,
                    fontSize: "0.95rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.4,
                  }}
                >
                  {faq.q}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.875rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.7,
                  }}
                >
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA strip ────────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div
            style={{
              backgroundColor: "var(--ink)",
              padding: "2.5rem 3rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.5rem",
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "1.3rem",
                  color: "var(--cream)",
                  letterSpacing: "-0.02em",
                  marginBottom: "0.3rem",
                }}
              >
                Ready to try it?
              </p>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.85rem",
                  color: "rgba(242,237,228,0.55)",
                }}
              >
                Search flights, trains, stays and experiences in one go.
              </p>
            </div>
            <Link
              href="/"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: "0.875rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink)",
                backgroundColor: "var(--cream)",
                padding: "0.9rem 2rem",
                textDecoration: "none",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Start searching
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
