import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import TripManagement from "@/components/TripManagement";
import { serverApiFetch } from "@/lib/serverApi";
import type { BookingRecord, SavedItinerary, TripRecord, UserTrip } from "@/lib/api";

interface Props {
  searchParams: Promise<{ manage?: string }>;
}

export default async function TripsPage({ searchParams }: Props) {
  const params = await searchParams;
  let savedItineraries: TripRecord[] = [];
  let bookings: BookingRecord[] = [];
  let userTrips: UserTrip[] = [];
  let tripsLoadError = "";
  try {
    bookings = await serverApiFetch<BookingRecord[]>("/api/bookings");
  } catch {
    // Trip membership controls remain available if booking lookup fails.
  }
  try {
    userTrips = await serverApiFetch<UserTrip[]>("/api/trips");
  } catch (error) {
    tripsLoadError = error instanceof Error ? error.message : "Trips are temporarily unavailable.";
  }
  try {
    const saved = await serverApiFetch<SavedItinerary[]>("/api/itineraries");
    savedItineraries = saved.map((item) => ({
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
    // Saved estimates are optional and kept separate from booked trip itineraries.
  }

  return (
    <>
      <Navbar />
      <main className="trips-overview-main">
        <div className="trips-overview-shell">
          <TripManagement
            initialTrips={userTrips}
            bookings={bookings}
            initialError={tripsLoadError}
            initialManagedTripId={params.manage}
          />

          <details id="saved-estimates" className="saved-estimates-section">
            <summary>Saved estimates <span>{savedItineraries.length}</span></summary>
            <p>These are saved search estimates, not confirmed bookings.</p>
            {savedItineraries.length === 0 ? (
              <p className="saved-estimates-empty">No saved estimates yet.</p>
            ) : (
              <div className="saved-estimates-list">
                {savedItineraries.map((itinerary) => (
                  <article key={itinerary.id} className="saved-estimate-card">
                    <div>
                      <h3>{itinerary.title}</h3>
                      <p>{itinerary.route} · {itinerary.dates}</p>
                      <span>{itinerary.included}</span>
                    </div>
                    <strong>{itinerary.total}</strong>
                    <div className="saved-estimate-actions">
                      <Link href={itinerary.primaryHref}>{itinerary.primaryCta}</Link>
                      <Link href={itinerary.secondaryHref}>{itinerary.secondaryCta}</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </details>
        </div>
      </main>
      <Footer />
    </>
  );
}
