import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { serverApiFetch } from "@/lib/serverApi";
import { buildTimeline, displayDate } from "@/lib/trip-itinerary";
import type { HydratedTripBooking, UserTrip } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

interface ItineraryEntry {
  key: string;
  bookingId: string;
  kind: "transport" | "hotel" | "experience" | "booking";
  title: string;
  meta: string;
  status: string;
  price: string;
  showBookingLink: boolean;
  hasBooking: boolean;
  warnings: string[];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function formatPrice(booking: HydratedTripBooking | null): string {
  const price = booking?.quote?.price;
  if (!price?.value) return "";
  const amount = Number(price.value);
  if (price.currency === "INR" && Number.isFinite(amount)) {
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
  }
  return `${price.currency ?? ""} ${price.value}`.trim();
}

function tripTotal(trip: UserTrip): string {
  const prices = trip.bookings.flatMap(({ booking, status }) => {
    if (status !== "CONFIRMED") return [];
    const currency = booking?.quote?.price?.currency;
    const value = Number(booking?.quote?.price?.value);
    return currency && Number.isFinite(value) ? [{ currency, value }] : [];
  });
  if (!prices.length) return "";
  const currencies = new Set(prices.map((price) => price.currency));
  if (currencies.size !== 1) return "Multiple currencies";
  const [currency] = currencies;
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
    .format(prices.reduce((sum, price) => sum + price.value, 0));
  return currency === "INR" ? `₹${formatted}` : `${currency} ${formatted}`;
}

function addEntry(
  entries: Map<string, ItineraryEntry[]>,
  date: string,
  entry: ItineraryEntry,
) {
  if (!date) return;
  const existing = entries.get(date) ?? [];
  existing.push(entry);
  entries.set(date, existing);
}

function itineraryEntries(trip: UserTrip): Map<string, ItineraryEntry[]> {
  const entries = new Map<string, ItineraryEntry[]>();
  const timeline = buildTimeline(trip);

  for (const item of timeline) {
    const booking = item.booking;
    const display = booking?.display ?? {};
    if (item.kind === "hotel" && booking) {
      const checkIn = text(display.checkIn) || item.startDate;
      const checkOut = text(display.checkOut) || item.endDate;
      const start = Date.parse(`${checkIn}T00:00:00Z`);
      const end = Date.parse(`${checkOut}T00:00:00Z`);
      const roomCount = text(booking.quantity) || "1";
      const customerDetails = booking.customer_details;
      const guests = Array.isArray(customerDetails.travellers)
        ? customerDetails.travellers
        : Array.isArray(customerDetails.people) ? customerDetails.people : [];
      const guestCount = String(guests.length || booking.criteria.guests || booking.quantity || 1);
      const hotelName = item.title;
      const common = {
        bookingId: item.bookingId,
        kind: "hotel" as const,
        hasBooking: Boolean(item.booking),
        status: statusLabel(item.status),
        warnings: item.warnings,
      };
      addEntry(entries, checkIn, {
        ...common,
        key: `${item.bookingId}-check-in`,
        title: `Check-in · ${hotelName}`,
        meta: `Check-in date · ${roomCount} room${roomCount === "1" ? "" : "s"} · ${guestCount} guest${guestCount === "1" ? "" : "s"}`,
        price: "",
        showBookingLink: false,
      });
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        for (let day = start + 86_400_000; day < end; day += 86_400_000) {
          const date = new Date(day).toISOString().slice(0, 10);
          addEntry(entries, date, {
            ...common,
            key: `${item.bookingId}-stay-${date}`,
            title: `Hotel stay continues · ${hotelName}`,
            meta: item.location,
            price: "",
            showBookingLink: false,
          });
        }
      }
      addEntry(entries, checkOut, {
        ...common,
        key: `${item.bookingId}-check-out`,
        title: `Check-out · ${hotelName}`,
        meta: "Check-out date",
        price: formatPrice(booking),
        showBookingLink: true,
      });
      continue;
    }

    const date = item.startDate || trip.start_date;
    const isTransport = item.kind === "transport";
    const time = text(display.time);
    const schedule = isTransport ? item.schedule.join(" · ") : time;
    const quantity = booking?.quantity;
    const unitLabel = item.kind === "experience" ? "participant" : "traveller";
    const people = quantity
      ? `${quantity} ${unitLabel}${quantity === 1 ? "" : "s"}`
      : "";
    const meta = [schedule, people, item.location].filter(Boolean).join(" · ")
      || (item.booking ? "Schedule details unavailable" : "Booking details unavailable");
    addEntry(entries, date, {
      key: item.bookingId,
      bookingId: item.bookingId,
      kind: item.kind === "transport" || item.kind === "experience" ? item.kind : "booking",
      title: item.title,
      meta,
      status: statusLabel(item.status),
      price: formatPrice(booking),
      showBookingLink: true,
      hasBooking: Boolean(item.booking),
      warnings: item.warnings,
    });
  }

  for (const dayEntries of entries.values()) {
    dayEntries.sort((first, second) => {
      const typeOrder = { transport: 0, hotel: 1, experience: 2, booking: 3 };
      return typeOrder[first.kind] - typeOrder[second.kind];
    });
  }
  return entries;
}

function categoryLabel(entries: ItineraryEntry[]): string {
  const kinds = new Set(entries.map((entry) => entry.kind));
  if (kinds.has("transport")) return "Travel";
  if (kinds.has("experience") && kinds.has("hotel")) return "Stay & experience";
  if (kinds.has("experience")) return "Experience";
  if (kinds.has("hotel")) return "Stay";
  return "Itinerary";
}

function formatDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return displayDate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}, ${displayDate(value)}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "CONFIRMED": return "Confirmed";
    case "CANCELLED": return "Cancelled";
    case "PENDING_UNKNOWN": return "Pending";
    case "INITIALIZED": return "Initialized";
    case "REJECTED": return "Not completed";
    case "UNAVAILABLE": return "Unavailable";
    default: return "Status unavailable";
  }
}

function iconFor(kind: ItineraryEntry["kind"]): string {
  if (kind === "hotel") return "▥";
  if (kind === "experience") return "✧";
  if (kind === "transport") return "▰";
  return "•";
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

  const days = trip ? itineraryEntries(trip) : new Map<string, ItineraryEntry[]>();
  const total = trip ? tripTotal(trip) : "";
  return (
    <>
      <Navbar />
      <main className="trip-itinerary-main">
        <div className="trip-itinerary-shell">
          {!trip ? (
            <section className="trip-itinerary-unavailable">
              <Link href="/trips">← Trips</Link>
              <h1>{unavailable ? "Trip itinerary unavailable" : "Trip not found"}</h1>
              <p>{unavailable
                ? "Sign in and try again. Your bookings have not been changed."
                : "This trip may have been removed or may belong to another account."}</p>
            </section>
          ) : (
            <>
              <Link href="/trips" className="trip-itinerary-back">← Trips</Link>
              <header className="trip-itinerary-heading">
                <div>
                  <h1>{trip.title}</h1>
                  <p>{trip.destination} · {displayDate(trip.start_date)} – {displayDate(trip.end_date)} · {trip.bookings.length} booking{trip.bookings.length === 1 ? "" : "s"}{total ? ` · ${total}` : ""}</p>
                </div>
                <Link
                  className="trip-itinerary-manage"
                  href={`/trips?manage=${encodeURIComponent(trip.id)}#trip-${encodeURIComponent(trip.id)}`}
                >
                  Manage Trip
                </Link>
              </header>
              <p className="trip-itinerary-notice">Each provider reservation is managed individually. Removing a booking from this trip does not cancel it.</p>

              {days.size === 0 ? (
                <p className="trip-itinerary-empty">No bookings have been added to this trip yet. Use Manage Trip to add an existing booking.</p>
              ) : (
                <ol className="trip-timeline" aria-label="Chronological itinerary">
                  {[...days.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([date, entries]) => (
                    <li key={date} className="trip-timeline-day">
                      <span className="trip-timeline-marker" aria-hidden="true" />
                      <h2>{formatDay(date)}</h2>
                      <p className="trip-timeline-category">{categoryLabel(entries)}</p>
                      <div className="trip-timeline-events">
                        {entries.map((entry) => (
                          <article key={entry.key} className="trip-timeline-event">
                            <span className="trip-timeline-icon" aria-hidden="true">{iconFor(entry.kind)}</span>
                            <div className="trip-timeline-event-info">
                              <h3>{entry.title}</h3>
                              <p>{entry.meta}</p>
                              {entry.status !== "Confirmed" && <span className="trip-event-status">{entry.status}</span>}
                              {!entry.hasBooking && <span className="trip-event-status">Booking details unavailable</span>}
                              {entry.warnings.map((warning) => <span className="trip-event-warning" key={warning}>{warning}</span>)}
                            </div>
                            {entry.price && <strong className="trip-timeline-price">{entry.price}</strong>}
                            {entry.showBookingLink && entry.hasBooking && (
                              <Link className="trip-timeline-booking-link" href={`/trips/bookings/${encodeURIComponent(entry.bookingId)}`}>
                                View Booking
                              </Link>
                            )}
                          </article>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
