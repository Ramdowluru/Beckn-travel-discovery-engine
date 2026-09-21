import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ─── Team data ───────────────────────────────────────────────── */
const team = [
  { role: "Beckn / BAP Lead",          responsibility: "Beckn transaction layer, shared internal data schema, BAP implementation." },
  { role: "Transport Aggregation",      responsibility: "Flight, train and bus provider integrations — normalisation and mock BPP." },
  { role: "Accommodation & Experiences",responsibility: "Hotel and local experience integrations, GIS and location intelligence." },
  { role: "Backend Infrastructure",     responsibility: "Redis caching, MongoDB design, retry/timeout logic, performance tuning." },
  { role: "Frontend / UX",              responsibility: "Next.js UI, end-to-end booking flow, journey-completion tracking." },
];

const stack = [
  { layer: "Frontend",  tech: "Next.js / React",  purpose: "Mobile-first, responsive UI with SSR" },
  { layer: "Backend",   tech: "FastAPI (Python)",  purpose: "REST APIs, Beckn protocol, async orchestration" },
  { layer: "Database",  tech: "MongoDB",           purpose: "Catalog, orders and journey data" },
  { layer: "Cache",     tech: "Redis",             purpose: "TTL-based price and availability caching" },
  { layer: "Protocol",  tech: "Beckn v0.9.1",      purpose: "Discovery, order and fulfillment lifecycle" },
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "5rem 2rem 4rem" }}>
          <p className="tag" style={{ marginBottom: "1.25rem" }}>About TDE</p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              color: "var(--ink)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              maxWidth: "640px",
              marginBottom: "1.5rem",
            }}
          >
            Travel planning
            <br />
            <em style={{ fontStyle: "italic", fontWeight: 400, color: "var(--ink-soft)" }}>
              without the middlemen.
            </em>
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "1rem",
              color: "var(--ink-soft)",
              lineHeight: 1.75,
              maxWidth: "560px",
            }}
          >
            Travel planning in India is fragmented — separate apps for flights,
            trains, buses, hotels and experiences, with no unified way to
            compare real-time prices across providers. TDE is a final-year
            engineering project that addresses this by building a Beckn
            Protocol-based travel discovery and booking platform.
          </p>
        </section>

        {/* ── Problem / Solution ───────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ backgroundColor: "var(--white)", padding: "2.5rem 2.5rem" }}>
              <p className="tag-neutral" style={{ marginBottom: "1rem" }}>The problem</p>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.9rem",
                  color: "var(--ink-soft)",
                  lineHeight: 1.75,
                }}
              >
                Travelers in India must currently rely on multiple fragmented
                platforms to plan a single trip — one for transport, another
                for accommodation, and separate searches for local experiences.
                There is no unified, real-time way to compare prices and
                availability across providers. This fragmentation leads to a
                poor and time-consuming planning experience.
              </p>
            </div>
            <div style={{ backgroundColor: "var(--ink)", padding: "2.5rem 2.5rem" }}>
              <p
                className="tag"
                style={{ color: "rgba(200,75,47,0.8)", marginBottom: "1rem" }}
              >
                The solution
              </p>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.9rem",
                  color: "rgba(242,237,228,0.7)",
                  lineHeight: 1.75,
                }}
              >
                A single platform that aggregates multi-modal transport,
                accommodation and local experiences from multiple providers
                through the Beckn Protocol — an open, decentralized commerce
                standard. No custom integrations. No middleman markup. Direct
                bookings from one unified interface.
              </p>
            </div>
          </div>
        </section>

        {/* ── KPIs ─────────────────────────────────────────────── */}
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
            Project targets
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {[
              { metric: "3+",    label: "Provider integrations" },
              { metric: "<3s",   label: "Search response time" },
              { metric: ">70%",  label: "Journey completion rate" },
              { metric: "0%",    label: "Platform markup" },
              { metric: "3",     label: "Transport modes" },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{ backgroundColor: "var(--white)", padding: "1.5rem 1.25rem", textAlign: "center" }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "1.75rem",
                    color: "var(--orange)",
                    letterSpacing: "-0.03em",
                    marginBottom: "0.3rem",
                  }}
                >
                  {kpi.metric}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.75rem",
                    color: "var(--ink-muted)",
                    lineHeight: 1.4,
                  }}
                >
                  {kpi.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Tech stack ───────────────────────────────────────── */}
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
            Technology stack
          </h2>
          <div
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--white)",
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 180px 1fr",
                borderBottom: "1px solid var(--border)",
                backgroundColor: "var(--cream-dark)",
              }}
            >
              {["Layer", "Technology", "Purpose"].map((h) => (
                <div key={h} style={{ padding: "0.6rem 1.25rem" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.6rem",
                      letterSpacing: "0.1em",
                      color: "var(--ink-muted)",
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </span>
                </div>
              ))}
            </div>
            {stack.map((row, i) => (
              <div
                key={row.layer}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 180px 1fr",
                  borderBottom: i < stack.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ padding: "0.875rem 1.25rem", borderRight: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.825rem", color: "var(--ink)" }}>{row.layer}</span>
                </div>
                <div style={{ padding: "0.875rem 1.25rem", borderRight: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.775rem", color: "var(--orange)" }}>{row.tech}</span>
                </div>
                <div style={{ padding: "0.875rem 1.25rem" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>{row.purpose}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Team ─────────────────────────────────────────────── */}
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
            Team structure
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
            {team.map((member) => (
              <div
                key={member.role}
                style={{
                  backgroundColor: "var(--white)",
                  padding: "1.25rem 1.75rem",
                  display: "grid",
                  gridTemplateColumns: "240px 1fr",
                  gap: "2rem",
                  alignItems: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                    fontSize: "0.875rem",
                    color: "var(--ink)",
                  }}
                >
                  {member.role}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.85rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  {member.responsibility}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer CTA ───────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div
            style={{
              border: "1px solid var(--border)",
              backgroundColor: "var(--white)",
              padding: "2rem 2.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.875rem",
                color: "var(--ink-soft)",
              }}
            >
              Want to understand the architecture better?
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <Link
                href="/how-it-works"
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 400,
                  fontSize: "0.825rem",
                  color: "var(--ink)",
                  border: "1px solid var(--border)",
                  padding: "0.55rem 1.25rem",
                  textDecoration: "none",
                }}
              >
                How it works
              </Link>
              <Link
                href="/partners"
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                  fontSize: "0.825rem",
                  color: "var(--white)",
                  backgroundColor: "var(--ink)",
                  padding: "0.55rem 1.25rem",
                  textDecoration: "none",
                }}
              >
                Our partners
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
