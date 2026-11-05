import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingManagement from "@/components/BookingManagement";
import { ServerApiError, serverApiFetch } from "@/lib/serverApi";
import type { BookingRecord } from "@/lib/api";
import { formatBookingDate, formatProviderDateTime, transportSchedule } from "@/lib/booking-dates";

interface Props {
  params: Promise<{ id: string }>;
}

function customerNames(booking: BookingRecord): string[] {
  const people = booking.customer_details.travellers ?? booking.customer_details.people ?? [];
  return people.map((person) => person.name);
}

function bookingLocation(booking: BookingRecord): string {
  const display = booking.display;
  return display.route
    || [display.departureCity, display.arrivalCity].filter(Boolean).join(" → ")
    || display.location
    || "";
}

function customerStatus(booking: BookingRecord): string {
  if (booking.status === "CONFIRMED") return "Confirmed";
  if (booking.status === "CANCELLED") return "Cancelled";
  if (booking.status === "REJECTED") return "Rejected by provider";
  if (booking.status === "INITIALIZED") return "Initialized";
  return "Pending provider update";
}

function fulfillmentStatus(booking: BookingRecord): string {
  const states = (booking.order.fulfillments ?? [])
    .map((fulfillment) => fulfillment.state || fulfillment.status)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return states.length ? [...new Set(states)].join(", ") : "";
}

function dateTime(booking: BookingRecord): string {
  if (booking.kind === "transport") return transportSchedule(booking);
  const rawDate = booking.display.date || booking.display.checkIn || booking.display.departure || "";
  const date = formatBookingDate(rawDate);
  const time = booking.display.time || "";
  if (booking.kind === "hotel") return date;
  const timestamp = booking.order.fulfillments?.[0]?.start?.time?.timestamp;
  return formatProviderDateTime(timestamp || "") || [date, time ? `${time} IST` : ""].filter(Boolean).join(", ");
}

function paymentLabel(booking: BookingRecord): string {
  const paymentStatus = booking.order.payments?.[0]?.status;
  return paymentStatus ? paymentStatus.replaceAll(/[_-]/g, " ").toLowerCase() : "Not paid — no payment was collected";
}

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  let booking: BookingRecord | null = null;
  let loadError: "not-found" | "service" | null = null;
  try {
    booking = await serverApiFetch<BookingRecord>(`/api/bookings/${encodeURIComponent(id)}`);
  } catch (error) {
    loadError = error instanceof ServerApiError && [401, 404].includes(error.status)
      ? "not-found"
      : "service";
  }
  const cancelled = booking?.status === "CANCELLED";
  const confirmed = booking?.status === "CONFIRMED" && !cancelled;
  const quote = booking?.quote?.price;
  const names = booking ? customerNames(booking) : [];
  const roomAssignments = booking?.customer_details.room_assignments ?? [];
  const bookedFor = booking?.kind === "hotel"
    ? `${booking.quantity ?? 1} room${booking?.quantity === 1 ? "" : "s"}`
    : `${booking?.quantity ?? 1} ${booking?.kind === "experience" ? "participant" : "traveller"}${booking?.quantity === 1 ? "" : "s"}`;

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div className="booking-detail-shell">
          <Link href="/bookings" className="booking-back-link">← My Bookings</Link>
          {!booking ? (
            <section className="booking-info-panel booking-unavailable">
              <h1>{loadError === "service" ? "Booking status temporarily unavailable" : "Booking unavailable"}</h1>
              <p>{loadError === "service"
                ? "We couldn’t load the persisted booking status. Refresh this page or return to My Bookings; no booking action was resubmitted."
                : "This booking was not found or is not available to this account."}</p>
              {loadError === "service" && <a href={`/trips/bookings/${encodeURIComponent(id)}`}>Refresh status</a>}
              <Link href="/bookings">Return to My Bookings</Link>
            </section>
          ) : (
            <article className="booking-detail-card">
              <header className="booking-detail-heading">
                <span className="booking-kind-label">{booking.kind}</span>
                <h1>{booking.service || "Provider booking"}</h1>
                <p>{booking.provider_name || booking.provider_id} · Ref {booking.provider_order_id || "pending"}</p>
                <span className={`booking-status status-${booking.status === "CONFIRMED" ? "confirmed" : booking.status === "CANCELLED" ? "cancelled" : booking.status === "REJECTED" ? "rejected" : "pending"}`}>
                  {customerStatus(booking)}
                </span>
              </header>

              <section className="booking-info-panel" aria-label="Reservation summary">
                <h2>Reservation summary</h2>
                <dl className="booking-info-rows">
                  {booking.kind === "transport" ? (
                    <>
                      <div><dt>Route</dt><dd>{bookingLocation(booking) || "Not specified"}</dd></div>
                      <div><dt>Departure</dt><dd>{dateTime(booking) || "Not specified"}</dd></div>
                      {booking.display.arrival && <div><dt>Arrival</dt><dd>{transportSchedule(booking).split(" – ")[1] || "Not specified"}</dd></div>}
                    </>
                  ) : booking.kind === "hotel" ? (
                    <>
                      <div><dt>Check-in</dt><dd>{booking.display.checkIn ? formatBookingDate(booking.display.checkIn) : "Not specified"}</dd></div>
                      <div><dt>Check-out</dt><dd>{booking.display.checkOut ? formatBookingDate(booking.display.checkOut) : "Not specified"}</dd></div>
                      {bookingLocation(booking) && <div><dt>Location</dt><dd>{bookingLocation(booking)}</dd></div>}
                    </>
                  ) : (
                    <>
                      <div><dt>Date &amp; time</dt><dd>{dateTime(booking) || "Not specified"}</dd></div>
                      {bookingLocation(booking) && <div><dt>Location</dt><dd>{bookingLocation(booking)}</dd></div>}
                    </>
                  )}
                  <div><dt>Booked for</dt><dd>{bookedFor}</dd></div>
                  <div><dt>Status</dt><dd>{customerStatus(booking)}</dd></div>
                  <div><dt>Payment</dt><dd>{paymentLabel(booking)}</dd></div>
                  {fulfillmentStatus(booking) && <div><dt>Provider status</dt><dd>{fulfillmentStatus(booking)}</dd></div>}
                  <div className="booking-total-row"><dt>Total</dt><dd>{quote?.currency} {quote?.value}</dd></div>
                </dl>
                {booking.quote?.breakup && booking.quote.breakup.length > 0 && (
                  <details className="booking-price-breakdown">
                    <summary>View price breakdown</summary>
                    <dl className="booking-info-rows">
                      {booking.quote.breakup.map((line, index) => (
                        <div key={`${line.title ?? "line"}-${index}`}>
                          <dt>{line.title || "Price item"}</dt>
                          <dd>{line.price?.currency} {line.price?.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </section>

              <section className="booking-info-panel" aria-label="Customer details">
                <h2>Customer details</h2>
                <dl className="booking-info-rows">
                  {names.length ? names.map((name, index) => {
                    const room = roomAssignments[index];
                    return (
                      <div key={`${name}-${index}`}>
                        <dt>{booking.kind === "experience" ? `Participant ${index + 1}` : booking.kind === "hotel" ? `Guest ${index + 1}` : `Traveller ${index + 1}`}</dt>
                        <dd>{name}{room ? ` · Room ${room}` : ""}</dd>
                      </div>
                    );
                  }) : <div><dt>Guests</dt><dd>Details unavailable</dd></div>}
                  {booking.customer_details.contact_email && <div><dt>Email</dt><dd>{booking.customer_details.contact_email}</dd></div>}
                  {booking.customer_details.contact_phone && <div><dt>Phone</dt><dd>{booking.customer_details.contact_phone}</dd></div>}
                </dl>
              </section>

              <section className="booking-info-panel" aria-label="Cancellation policy">
                <h2>Cancellation policy</h2>
                <p className="booking-policy-text">{booking.cancellation_policy || "Please contact the provider for cancellation terms."}</p>
              </section>

              {booking.status === "INITIALIZED" && <p role="status" className="booking-state-note">Initialized only. This does not confirm the booking or reserve inventory.</p>}
              {booking.status === "PENDING_UNKNOWN" && <p role="status" className="booking-state-note">Provider outcome is pending or unknown; refresh status to reconcile safely.</p>}
              {booking.status === "REJECTED" && <p role="alert" className="booking-state-note">The provider rejected the latest booking action. No successful booking is shown.</p>}
              {cancelled && <p role="status" className="booking-state-note">Booking cancelled. This simulated booking was unpaid; a refund is not applicable.</p>}
              {confirmed && (
                <a className="booking-download-link" href={`/api/bookings/${encodeURIComponent(booking.id)}/ticket`}>↓ &nbsp;Download Mock {booking.kind === "transport" ? "Ticket" : "Voucher"}</a>
              )}
              {confirmed && <p className="booking-prototype-note">Academic prototype — not valid for travel.</p>}
              <BookingManagement booking={booking} />
            </article>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
