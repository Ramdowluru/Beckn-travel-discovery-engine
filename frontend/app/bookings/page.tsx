import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { serverApiFetch } from "@/lib/serverApi";
import type { BookingRecord } from "@/lib/api";

interface Props {
  searchParams: Promise<{ date?: string; status?: string }>;
}

const dateFilters = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

const statusFilters = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rejected", label: "Rejected" },
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
  return String(
    booking.display.date
    || booking.display.checkIn
    || booking.display.departure
    || booking.order.fulfillments?.[0]?.start?.time?.timestamp
    || "",
  );
}

function isPast(booking: BookingRecord): boolean {
  const scheduled = scheduledAt(booking);
  if (!scheduled) return false;
  const timestamp = Date.parse(scheduled);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function filterHref(date: string, status: string) {
  return `/bookings?date=${encodeURIComponent(date)}&status=${encodeURIComponent(status)}`;
}

export default async function BookingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const dateFilter = dateFilters.some((filter) => filter.value === params.date) ? params.date! : "all";
  const statusFilter = statusFilters.some((filter) => filter.value === params.status) ? params.status! : "all";

  let bookings: BookingRecord[] = [];
  let loadError = "";
  try {
    bookings = await serverApiFetch<BookingRecord[]>("/api/bookings");
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Bookings are temporarily unavailable.";
  }

  const filteredBookings = bookings.filter((booking) => {
    const statusMatches = statusFilter === "all" || bookingStatus(booking.status) === statusFilter;
    const dateMatches = dateFilter === "all"
      || (dateFilter === "past" ? isPast(booking) : !isPast(booking));
    return statusMatches && dateMatches;
  });

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "3.5rem 2rem 5rem" }}>
          <p className="tag" style={{ color: "var(--orange)", marginBottom: "0.75rem" }}>Your account</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(2rem, 4vw, 3rem)", color: "var(--ink)", marginBottom: "0.5rem" }}>
            My bookings
          </h1>
          <p style={{ fontFamily: "var(--font-body)", color: "var(--ink-soft)", marginBottom: "2rem" }}>
            Confirmed and pending provider bookings, kept separately from saved estimates.
          </p>

          <div className="bookings-filter-bar" aria-label="Booking filters">
            <div>
              <span className="filter-label">Date</span>
              <div className="filter-options">
                {dateFilters.map((filter) => (
                  <Link
                    key={filter.value}
                    href={filterHref(filter.value, statusFilter)}
                    aria-current={dateFilter === filter.value ? "page" : undefined}
                    className={dateFilter === filter.value ? "filter-option active" : "filter-option"}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <span className="filter-label">Status</span>
              <div className="filter-options">
                {statusFilters.map((filter) => (
                  <Link
                    key={filter.value}
                    href={filterHref(dateFilter, filter.value)}
                    aria-current={statusFilter === filter.value ? "page" : undefined}
                    className={statusFilter === filter.value ? "filter-option active" : "filter-option"}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {loadError ? (
            <p role="alert" className="booking-empty">Bookings are temporarily unavailable: {loadError}</p>
          ) : filteredBookings.length === 0 ? (
            <p className="booking-empty">No bookings match these filters.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {filteredBookings.map((booking) => (
                <article key={booking.id} className="booking-list-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", color: "var(--ink)" }}>
                        {booking.service || (booking.kind === "hotel" ? "Hotel booking" : booking.kind === "experience" ? "Experience booking" : "Transport booking")}
                      </h2>
                      <p className="booking-card-meta">{booking.provider_name || booking.provider_id} · {booking.kind}</p>
                      {scheduledAt(booking) && <p className="booking-card-meta">{scheduledAt(booking)}</p>}
                      {bookingLocation(booking) && <p className="booking-card-meta">{bookingLocation(booking)}</p>}
                      {booking.provider_order_id && <p className="booking-card-meta">Provider reference: {booking.provider_order_id}</p>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong className={`booking-status status-${bookingStatus(booking.status)}`}>
                        {customerStatus(booking.status)}
                      </strong>
                      <p className="booking-card-price">{formattedQuote(booking)} <span style={{ display: "block", fontSize: "0.68rem", color: "var(--ink-muted)" }}>total</span></p>
                    </div>
                  </div>
                  <Link className="booking-card-link" href={`/trips/bookings/${encodeURIComponent(booking.id)}`}>
                    View booking
                  </Link>
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
