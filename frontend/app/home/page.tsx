import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SearchBar from "@/components/SearchBar";
import { serverApiFetch } from "@/lib/serverApi";
import type { TransportOption } from "@/lib/types";

/* ─── API shape ───────────────────────────────────────────────── */
interface HomeData {
  popularOptions: (TransportOption & { type: string })[];
  stats: { value: string; label: string }[];
}

export default async function LandingPage() {
  let data: HomeData = { popularOptions: [], stats: [] };
  try {
    data = await serverApiFetch<HomeData>("/api/home");
  } catch {
    /* backend not available — render with empty state */
  }

  const { popularOptions, stats } = data;

  return (
    <>
      <Navbar />

      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "5rem 2rem 3rem",
          }}
        >
          <p className="tag" style={{ marginBottom: "1.25rem" }}>
            Plan your trip
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              color: "var(--ink)",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginBottom: "1.25rem",
              maxWidth: "520px",
            }}
          >
            One search.
            <br />
            Every way to go.
          </h1>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "1rem",
              color: "var(--ink-soft)",
              lineHeight: 1.7,
              maxWidth: "420px",
              marginBottom: "2.5rem",
            }}
          >
            Compare flights, trains, buses, hotels and local experiences
            across India — then book directly with the provider.
          </p>

          <SearchBar />
        </section>

        {/* ── Stats bar ─────────────────────────────────────────── */}
        {stats.length > 0 && (
          <section
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "0 2rem 3rem",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
                border: "1px solid var(--border)",
                backgroundColor: "var(--white)",
                maxWidth: "800px",
              }}
            >
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "1.25rem 1.5rem",
                    borderRight:
                      i < stats.length - 1 ? "1px solid var(--border)" : "none",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "1.5rem",
                      color: "var(--ink)",
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
                      letterSpacing: "0.02em",
                    }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Popular this week ─────────────────────────────────── */}
        {popularOptions.length > 0 && (
          <section
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "0 2rem 5rem",
            }}
          >
            <div style={{ marginBottom: "1.25rem" }}>
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
                Popular this week
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.825rem",
                  color: "var(--ink-soft)",
                }}
              >
                Top transport options from the most searched route.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(popularOptions.length, 3)}, 1fr)`,
                gap: "1px",
                backgroundColor: "var(--border)",
                border: "1px solid var(--border)",
                maxWidth: "900px",
              }}
            >
              {popularOptions.map((option) => (
                <div
                  key={option.id}
                  style={{ backgroundColor: "var(--white)", padding: "1.25rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: "0.875rem",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 500,
                          fontSize: "0.875rem",
                          color: "var(--ink)",
                        }}
                      >
                        {option.provider}
                      </span>
                      <span
                        className="tag-neutral"
                        style={{ marginLeft: "0.5rem", fontSize: "0.6rem" }}
                      >
                        · {option.type}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        color: "var(--orange)",
                      }}
                    >
                      {option.duration}
                    </span>
                  </div>

                  <p
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 600,
                      fontSize: "1.1rem",
                      color: "var(--ink)",
                      letterSpacing: "-0.01em",
                      marginBottom: "0.2rem",
                    }}
                  >
                    {option.departure} → {option.arrival}
                  </p>

                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 300,
                      fontSize: "0.775rem",
                      color: "var(--ink-muted)",
                      marginBottom: "1rem",
                    }}
                  >
                    {option.stops}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: "1.15rem",
                        color: "var(--ink)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {option.price}
                    </span>
                    <Link
                      href={`/results/transport/${option.id}`}
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: 500,
                        fontSize: "0.775rem",
                        letterSpacing: "0.04em",
                        color: "var(--white)",
                        backgroundColor: "var(--ink)",
                        padding: "0.45rem 1rem",
                        textDecoration: "none",
                      }}
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
}
