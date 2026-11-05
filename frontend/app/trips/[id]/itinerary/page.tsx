import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { serverApiFetch } from "@/lib/serverApi";
import { buildTimeline, displayDate } from "@/lib/trip-itinerary";
import type { UserTrip } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

function statusLabel(status: string): string {
  switch (status) {
    case "CONFIRMED": return "Confirmed";
    case "CANCELLED": return "Cancelled";
    case "PENDING_UNKNOWN": return "Waiting for provider update";
    case "INITIALIZED": return "Not yet confirmed";
    case "REJECTED": return "Not completed";
    case "UNAVAILABLE": return "Booking unavailable";
    default: return "Status unavailable";
  }
}

export default async function TripItineraryPage({ params }: Props) {
  const { id } = await params;
  let trip: UserTrip | null = null;
  let unavailable = false;
  try {
    trip = await serverApiFetch<UserTrip>(`/api/trips/${encodeURIComponent(id)}`);
  } catch {
    unavailable = true;
  }

  const timeline = trip ? buildTimeline(trip) : [];
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "3.5rem 1.25rem 5rem" }}>
          <Link href="/trips" style={{ color: "var(--ink-soft)", fontFamily: "var(--font-body)", fontSize: "0.82rem" }}>
            ← My trips
          </Link>
          {!trip ? (
            <section style={{ marginTop: "1.5rem", padding: "2rem", background: "var(--white)", border: "1px solid var(--border)" }}>
              <h1 style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
                {unavailable ? "Trip itinerary unavailable" : "Trip not found"}
              </h1>
              <p style={{ marginTop: "0.75rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                {unavailable
                  ? "Sign in and try again. Your bookings have not been changed."
                  : "This trip may have been removed or may belong to another account."}
              </p>
            </section>
          ) : (
            <>
              <header style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
                <p className="tag-neutral">Trip itinerary · separate provider bookings</p>
                <h1 style={{ marginTop: "0.55rem", fontFamily: "var(--font-display)", fontSize: "clamp(1.7rem, 5vw, 2.5rem)", color: "var(--ink)" }}>
                  {trip.title}
                </h1>
                <p style={{ marginTop: "0.45rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                  {trip.destination} · {displayDate(trip.start_date)} – {displayDate(trip.end_date)}
                </p>
                <p style={{ marginTop: "0.75rem", maxWidth: "700px", color: "var(--ink-soft)", fontFamily: "var(--font-body)", fontSize: "0.85rem", lineHeight: 1.6 }}>
                  This itinerary groups bookings from independent providers. It is not a combined order or checkout. Removing a booking here does not cancel it.
                </p>
              </header>
              {timeline.length === 0 ? (
                <p style={{ padding: "1.5rem", background: "var(--white)", border: "1px solid var(--border)", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                  No bookings have been added to this trip yet. Add an existing booking from My trips.
                </p>
              ) : (
                <ol aria-label="Chronological itinerary" style={{ listStyle: "none", display: "grid", gap: "0.85rem", padding: 0 }}>
                  {timeline.map((item) => (
                    <li key={item.bookingId}>
                      <article style={{ minWidth: 0, padding: "1.1rem", background: "var(--white)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                            <p className="tag-neutral">{item.kind === "hotel" ? "Stay" : item.kind}</p>
                            <h2 style={{ marginTop: "0.3rem", fontFamily: "var(--font-display)", fontSize: "1.2rem", color: "var(--ink)", overflowWrap: "anywhere" }}>
                              {item.title}
                            </h2>
                            <p style={{ marginTop: "0.25rem", fontFamily: "var(--font-body)", color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                              {item.provider}{item.location ? ` · ${item.location}` : ""}
                            </p>
                          </div>
                          <span style={{ padding: "0.3rem 0.55rem", border: "1px solid var(--border)", color: "var(--ink-soft)", fontFamily: "var(--font-body)", fontSize: "0.75rem" }}>
                            {statusLabel(item.status)}
                          </span>
                        </div>
                        <div style={{ display: "grid", gap: "0.25rem", marginTop: "0.85rem", fontFamily: "var(--font-body)", color: "var(--ink)", fontSize: "0.82rem", overflowWrap: "anywhere" }}>
                          {item.schedule.map((line) => <p key={line}>{line}</p>)}
                        </div>
                        {item.warnings.length > 0 && (
                          <ul aria-label="Schedule advisories" style={{ marginTop: "0.75rem", paddingLeft: "1.2rem", color: "#8a4b13", fontFamily: "var(--font-body)", fontSize: "0.78rem" }}>
                            {item.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                          </ul>
                        )}
                        {item.booking ? (
                          <Link href={`/trips/bookings/${encodeURIComponent(item.bookingId)}`} style={{ display: "inline-block", marginTop: "0.9rem", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: "0.8rem", textUnderlineOffset: "3px" }}>
                            View booking details
                          </Link>
                        ) : (
                          <p style={{ marginTop: "0.9rem", color: "var(--ink-muted)", fontFamily: "var(--font-body)", fontSize: "0.8rem" }}>
                            Booking details are unavailable.
                          </p>
                        )}
                      </article>
                    </li>
                  ))}
                </ol>
              )}
              <Link href="/trips" style={{ display: "inline-block", marginTop: "1rem", padding: "0.65rem 0.9rem", background: "var(--ink)", color: "var(--white)", fontFamily: "var(--font-body)", fontSize: "0.8rem", textDecoration: "none" }}>
                Manage trip bookings
              </Link>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
