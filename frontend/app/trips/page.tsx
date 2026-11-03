import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { serverApiFetch } from "@/lib/serverApi";
import type { BookingRecord, SavedItinerary, TripRecord } from "@/lib/api";

/* ─── Sidebar nav ─────────────────────────────────────────────── */
const sidebarNav = [
  { label: "My trips",       href: "/trips",              active: true  },
  { label: "Saved settings", href: "/trips/settings",     active: false },
  { label: "Preferences",    href: "/trips/preferences",  active: false },
  { label: "Travel history", href: "/trips/history",      active: false },
  { label: "Help & support", href: "/help",               active: false },
];

/* ─── Status badge colours ────────────────────────────────────── */
type TripStatus = "SAVED" | "COMPLETED" | "UPCOMING";

const statusStyle: Record<TripStatus, { color: string; bg: string; border: string }> = {
  SAVED:     { color: "var(--ink)",    bg: "var(--cream-dark)", border: "var(--border)" },
  COMPLETED: { color: "var(--white)",  bg: "var(--ink)",        border: "var(--ink)"    },
  UPCOMING:  { color: "var(--orange)", bg: "transparent",       border: "var(--orange)" },
};

export default async function TripsPage() {
  let trips: TripRecord[] = [];
  let bookings: BookingRecord[] = [];
  try {
    bookings = await serverApiFetch<BookingRecord[]>("/api/bookings");
  } catch {
    /* Signed-out and unavailable states share the existing empty presentation. */
  }
  try {
    const saved = await serverApiFetch<SavedItinerary[]>("/api/itineraries");
    trips = saved.map((item) => ({
      id: item.id,
      title: `${item.transport.provider} ${item.transport.type}`,
      status: "SAVED",
      route: `${item.query.from} → ${item.query.to}`,
      dates: `${item.query.date} · ${item.query.travellers} ${item.query.travellers === 1 ? "traveller" : "travellers"}`,
      included: `${item.transport.currency} ${item.transport.totalPrice} saved estimate`,
      total: `${item.transport.currency} ${item.transport.totalPrice}`,
      primaryCta: "View itinerary",
      primaryHref: `/trips/${encodeURIComponent(item.id)}`,
      secondaryCta: "Search again",
      secondaryHref: `/results?tab=travel&from=${encodeURIComponent(item.query.from)}&to=${encodeURIComponent(item.query.to)}&date=${encodeURIComponent(item.query.date)}&travellers=${item.query.travellers}`,
    }));
  } catch {
    /* Signed-out and unavailable states share the existing empty presentation. */
  }

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "3.5rem 2rem 5rem",
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: "3rem",
            alignItems: "start",
          }}
        >
          {/* ── Left: sidebar ─────────────────────────────────── */}
          <aside>
            {/* Nav links */}
            <div
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--white)",
                overflow: "hidden",
              }}
            >
              {sidebarNav.map((item, i) => (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "0.875rem 1.5rem",
                    fontFamily: "var(--font-body)",
                    fontWeight: item.active ? 500 : 300,
                    fontSize: "0.85rem",
                    color: item.active ? "var(--white)" : "var(--ink-soft)",
                    backgroundColor: item.active ? "var(--ink)" : "transparent",
                    textDecoration: "none",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </aside>

          {/* ── Right: trips list ─────────────────────────────── */}
          <div>
            {/* Header row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "1.75rem",
              }}
            >
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.75rem",
                  color: "var(--ink)",
                  letterSpacing: "-0.025em",
                }}
              >
                My trips
              </h1>
              <Link
                href="/home"
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  letterSpacing: "0.04em",
                  color: "var(--white)",
                  backgroundColor: "var(--ink)",
                  padding: "0.6rem 1.25rem",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Plan a new trip
              </Link>
            </div>

            <section aria-labelledby="bookings-heading" style={{ marginBottom: "2.5rem" }}>
              <h2
                id="bookings-heading"
                style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: "var(--ink)", marginBottom: "1rem" }}
              >
                My bookings
              </h2>
              {bookings.length === 0 ? (
                <p style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1.25rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)", fontSize: "0.85rem" }}>
                  No provider bookings yet. Saved itineraries are estimates and are listed separately below.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {bookings.map((booking) => (
                    <article key={booking.id} style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", color: "var(--ink)" }}>
                            {booking.service || (booking.kind === "hotel" ? "Hotel booking" : booking.kind === "experience" ? "Experience booking" : "Transport booking")}
                          </h3>
                          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink-soft)", marginTop: "0.25rem" }}>
                            {booking.provider_name || booking.provider_id} · {booking.kind}
                          </p>
                          {booking.provider_order_id && (
                            <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-muted)", marginTop: "0.25rem" }}>
                              Provider reference: {booking.provider_order_id}
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <strong style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: booking.status === "CONFIRMED" ? "var(--orange)" : "var(--ink-soft)" }}>
                            {booking.status.replaceAll("_", " ")}
                          </strong>
                          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--ink)", marginTop: "0.35rem" }}>
                            {booking.quote?.price?.currency} {booking.quote?.price?.value}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/trips/bookings/${encodeURIComponent(booking.id)}`}
                        style={{ display: "inline-block", marginTop: "0.9rem", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: "0.8rem" }}
                      >
                        Manage booking
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.25rem", color: "var(--ink)", marginBottom: "1rem" }}>
              Saved itineraries
            </h2>

            {/* Empty state */}
            {trips.length === 0 && (
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
                    marginBottom: "1.25rem",
                  }}
                >
                  No saved itineraries yet. Search for travel and save an estimate to return to it later.
                </p>
                <Link
                  href="/home"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                    fontSize: "0.825rem",
                    letterSpacing: "0.04em",
                    color: "var(--white)",
                    backgroundColor: "var(--ink)",
                    padding: "0.7rem 1.5rem",
                    textDecoration: "none",
                  }}
                >
                  Search now
                </Link>
              </div>
            )}

            {/* Trip cards */}
            {trips.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  backgroundColor: "var(--border)",
                  border: "1px solid var(--border)",
                }}
              >
                {trips.map((trip) => {
                  const badge = statusStyle[trip.status as TripStatus] ?? statusStyle.SAVED;
                  return (
                    <div
                      key={trip.id}
                      style={{ backgroundColor: "var(--white)", padding: "1.5rem 1.75rem" }}
                    >
                      {/* Title row */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: "1rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                          <h2
                            style={{
                              fontFamily: "var(--font-display)",
                              fontWeight: 600,
                              fontSize: "1.1rem",
                              color: "var(--ink)",
                              letterSpacing: "-0.015em",
                            }}
                          >
                            {trip.title}
                          </h2>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.58rem",
                              fontWeight: 500,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              color: badge.color,
                              backgroundColor: badge.bg,
                              border: `1px solid ${badge.border}`,
                              padding: "0.2rem 0.6rem",
                            }}
                          >
                            {trip.status}
                          </span>
                        </div>
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            fontSize: "1.1rem",
                            color: "var(--ink)",
                            letterSpacing: "-0.01em",
                            flexShrink: 0,
                            marginLeft: "1rem",
                          }}
                        >
                          {trip.total}
                        </span>
                      </div>

                      {/* Meta row */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "1rem",
                          marginBottom: "1.25rem",
                          paddingBottom: "1.25rem",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        {[
                          { label: "Route",    value: trip.route    },
                          { label: "Dates",    value: trip.dates    },
                          { label: "Included", value: trip.included },
                        ].map((meta) => (
                          <div key={meta.label}>
                            <p className="tag-neutral" style={{ marginBottom: "0.2rem", fontSize: "0.58rem" }}>
                              {meta.label}
                            </p>
                            <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.825rem", color: "var(--ink)" }}>
                              {meta.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* CTA row */}
                      <div style={{ display: "flex", gap: "0.75rem" }}>
                        <Link
                          href={trip.primaryHref}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.8rem",
                            letterSpacing: "0.02em",
                            color: "var(--ink)",
                            backgroundColor: "transparent",
                            border: "1px solid var(--border)",
                            padding: "0.55rem 1.1rem",
                            textDecoration: "none",
                          }}
                        >
                          {trip.primaryCta}
                        </Link>
                        <Link
                          href={trip.secondaryHref}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 500,
                            fontSize: "0.8rem",
                            letterSpacing: "0.02em",
                            color: "var(--white)",
                            backgroundColor: "var(--ink)",
                            border: "1px solid var(--ink)",
                            padding: "0.55rem 1.1rem",
                            textDecoration: "none",
                          }}
                        >
                          {trip.secondaryCta}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
