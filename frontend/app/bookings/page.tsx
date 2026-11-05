import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { serverApiFetch } from "@/lib/serverApi";
import type { BookingRecord } from "@/lib/api";
import { formatBookingDate, transportSchedule } from "@/lib/booking-dates";

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const bookingKinds = [
  { value: "all", label: "All" },
  { value: "transport", label: "Travel" },
  { value: "hotel", label: "Stay" },
  { value: "experience", label: "Experience" },
];

function bookingStatus(status: BookingRecord["status"]): string {
  if (status === "REJECTED") return "rejected";
  if (status === "PENDING_UNKNOWN" || status === "INITIALIZED") return "pending";
  return status === "CONFIRMED" ? "confirmed" : "cancelled";
}

function customerStatus(status: BookingRecord["status"]): string {
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "REJECTED") return "Rejected";
  if (status === "INITIALIZED") return "Initialized, awaiting confirmation";
  return "Pending provider update";
}

function bookingLocation(booking: BookingRecord): string {
  const display = booking.display;
  return display.route
    || [display.departureCity, display.arrivalCity].filter(Boolean).join(" → ")
    || String(display.location || "");
}

function formattedQuote(booking: BookingRecord): string {
  const price = booking.quote?.price;
  if (!price?.currency && !price?.value) return "Price unavailable";
  return `${price.currency || ""} ${price.value || ""}`.trim();
}

function scheduledAt(booking: BookingRecord): string {
  if (booking.kind === "transport") return transportSchedule(booking);
  const rawDate = String(
    booking.display.date
    || booking.display.checkIn
    || booking.display.departure
    || booking.order.fulfillments?.[0]?.start?.time?.timestamp
    || "",
  );
  if (!rawDate) return "";
  const date = formatBookingDate(rawDate);
  const time = String(booking.display.time || booking.display.departure || "");
  return [date, time].filter(Boolean).join(", ");
}

function filterHref(kind: string) {
  return kind === "all" ? "/bookings" : `/bookings?kind=${encodeURIComponent(kind)}`;
}

function kindIcon(kind: BookingRecord["kind"]): string {
  if (kind === "hotel") return "▥";
  if (kind === "experience") return "✧";
  return "♧";
}

export default async function BookingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeKind = bookingKinds.some((filter) => filter.value === params.kind) ? params.kind! : "all";

  let bookings: BookingRecord[] = [];
  let loadError = "";
  try {
    bookings = await serverApiFetch<BookingRecord[]>("/api/bookings");
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Bookings are temporarily unavailable.";
  }

  const filteredBookings = activeKind === "all"
    ? bookings
    : bookings.filter((booking) => booking.kind === activeKind);

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div className="my-bookings-shell">
          <p className="tag booking-eyebrow">Your account</p>
          <h1 className="my-bookings-title">My Bookings</h1>
          <p className="my-bookings-subtitle">Each provider reservation is managed individually.</p>

          <nav className="booking-kind-tabs" aria-label="Filter bookings by type">
            {bookingKinds.map((filter) => {
              const count = filter.value === "all"
                ? bookings.length
                : bookings.filter((booking) => booking.kind === filter.value).length;
              return (
                <Link
                  key={filter.value}
                  href={filterHref(filter.value)}
                  aria-current={activeKind === filter.value ? "page" : undefined}
                  className={activeKind === filter.value ? "booking-kind-tab active" : "booking-kind-tab"}
                >
                  {filter.label} <span>{count}</span>
                </Link>
              );
            })}
          </nav>

          {loadError ? (
            <p role="alert" className="booking-empty">Bookings are temporarily unavailable: {loadError}</p>
          ) : filteredBookings.length === 0 ? (
            <p className="booking-empty">{bookings.length ? "No bookings in this category yet." : "Your confirmed bookings will appear here."}</p>
          ) : (
            <div className="booking-list">
              {filteredBookings.map((booking) => (
                <article key={booking.id} className="booking-list-card">
                  <span className="booking-kind-icon" aria-hidden="true">{kindIcon(booking.kind)}</span>
                  <div className="booking-list-info">
                    <h2>{booking.service || (booking.kind === "hotel" ? "Stay booking" : booking.kind === "experience" ? "Experience booking" : "Travel booking")}</h2>
                    <span className={`booking-status status-${bookingStatus(booking.status)}`}>{customerStatus(booking.status)}</span>
                    <p className="booking-card-meta">
                      {bookingLocation(booking)}{bookingLocation(booking) && scheduledAt(booking) ? " · " : ""}{scheduledAt(booking)}
                    </p>
                    <p className="booking-card-meta">
                      {booking.kind === "hotel" ? `${booking.quantity ?? 1} room${booking.quantity === 1 ? "" : "s"}` : `${booking.quantity ?? 1} ${booking.kind === "experience" ? "participant" : "traveller"}${booking.quantity === 1 ? "" : "s"}`}
                      {booking.id ? ` · Ref ${booking.id.slice(0, 8).toUpperCase()}` : ""}
                    </p>
                  </div>
                  <strong className="booking-card-price">{formattedQuote(booking)}</strong>
                  <Link className="booking-card-link" href={`/trips/bookings/${encodeURIComponent(booking.id)}`}>View Booking</Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
