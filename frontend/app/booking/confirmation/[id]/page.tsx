import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ServerApiError, serverApiFetch } from "@/lib/serverApi";
import { destinationArrivalDate, formatBookingDate, formatProviderDateTime } from "@/lib/booking-dates";
import type { BookingRecord } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

function bookingDateValue(booking: BookingRecord): string {
  return String(
    booking.display.date
    || booking.criteria.date
    || booking.criteria.experience_date
    || booking.display.checkIn
    || booking.criteria.check_in
    || "",
  );
}

function displayDate(booking: BookingRecord): string {
  const date = bookingDateValue(booking);
  return date ? formatBookingDate(date) : "Date as selected";
}

function displaySchedule(booking: BookingRecord): string {
  const fulfillment = booking.order.fulfillments?.[0];
  const startTimestamp = fulfillment?.start?.time?.timestamp;
  const endTimestamp = fulfillment?.end?.time?.timestamp;
  if (booking.kind === "transport") {
    const actualSchedule = [
      startTimestamp ? formatProviderDateTime(startTimestamp) : "",
      endTimestamp ? formatProviderDateTime(endTimestamp) : "",
    ].filter(Boolean);
    if (actualSchedule.length === 2) return actualSchedule.join(" – ");
    const departureDate = formatBookingDate(String(booking.display.departureDate || booking.display.date || ""));
    const arrivalDate = formatBookingDate(String(booking.display.arrivalDate || booking.display.date || ""));
    const departure = [departureDate, booking.display.departure ? `${booking.display.departure} IST` : ""].filter(Boolean).join(", ");
    const arrival = [arrivalDate, booking.display.arrival ? `${booking.display.arrival} IST` : ""].filter(Boolean).join(", ");
    if (departure && arrival) return `${departure} – ${arrival}`;
  }
  const time = booking.display.time;
  if (time) return `${time}${time.includes("IST") ? "" : " IST"}`;
  return "Schedule as selected";
}

function confirmedArrivalDate(booking: BookingRecord): string {
  return destinationArrivalDate(booking);
}

function displayStayDates(booking: BookingRecord): string {
  const checkIn = String(booking.display.checkIn || booking.criteria.check_in || "");
  const checkOut = String(booking.display.checkOut || booking.criteria.check_out || "");
  if (checkIn && checkOut) return `${formatBookingDate(checkIn)} – ${formatBookingDate(checkOut)}`;
  return formatBookingDate(checkIn || checkOut) || "Dates as selected";
}

function destination(booking: BookingRecord): string {
  return String(
    booking.display.arrivalCity
      || booking.criteria.to
      || booking.display.location
      || "",
  );
}

export default async function BookingConfirmationPage({ params }: Props) {
  const { id } = await params;
  let booking: BookingRecord | null = null;
  let unavailableReason: "not-found" | "service" | null = null;
  try {
    booking = await serverApiFetch<BookingRecord>(`/api/bookings/${encodeURIComponent(id)}`);
  } catch (error) {
    unavailableReason = error instanceof ServerApiError && [401, 404].includes(error.status)
      ? "not-found"
      : "service";
  }

  const confirmed = booking?.status === "CONFIRMED";
  const isStay = booking?.kind === "hotel";
  const isExperience = booking?.kind === "experience";
  const price = booking?.quote?.price;
  const place = booking ? destination(booking) : "";
  const date = booking ? displayDate(booking) : "";
  const checkIn = booking && isStay ? String(booking.display.checkIn || booking.criteria.check_in || "") : "";
  const checkOut = booking && isStay ? String(booking.display.checkOut || booking.criteria.check_out || "") : "";
  const rooms = booking?.quantity ?? 1;
  const people = booking?.customer_details.travellers ?? booking?.customer_details.people ?? [];
  const partySize = people.length || Number(
    booking?.criteria.travellers
    ?? booking?.criteria.guests
    ?? booking?.criteria.participants
    ?? booking?.quantity
    ?? 1,
  );
  const guests = booking?.kind === "hotel"
    ? people.length || Number(booking.criteria.guests ?? 0)
    : 0;
  const stayStart = booking
    ? booking.kind === "transport"
      ? confirmedArrivalDate(booking)
      : isStay
        ? checkIn
        : bookingDateValue(booking)
    : "";
  const experienceDate = booking
    ? booking.kind === "transport"
      ? confirmedArrivalDate(booking)
      : bookingDateValue(booking)
    : "";
  const staysParams = new URLSearchParams({
    tab: "stays",
    ...(place ? { to: place } : {}),
    ...(isStay ? {
      ...(checkIn ? { check_in: checkIn } : {}),
      ...(checkOut ? { check_out: checkOut } : {}),
      rooms: String(rooms),
      ...(guests ? { guests: String(guests) } : {}),
    } : stayStart !== "Date as selected" && stayStart ? {
      check_in: stayStart,
      guests: String(partySize),
    } : {}),
  });
  const experiencesParams = new URLSearchParams({
    tab: "experiences",
    ...(place ? { to: place } : {}),
    ...(experienceDate ? { experience_date: experienceDate } : {}),
    participants: String(partySize),
  });

  return (
    <>
      <Navbar />
      <main className="booking-confirmation-main">
        {!booking ? (
          <section className="booking-confirmation-unavailable">
            <h1>{unavailableReason === "service" ? "Booking status temporarily unavailable" : "Booking confirmation unavailable"}</h1>
            <p>{unavailableReason === "service"
              ? "We couldn’t verify the persisted provider outcome. Refresh this page or check My Bookings; do not resubmit the booking."
              : "This booking was not found for your account."}</p>
            {unavailableReason === "service" && <a href={`/booking/confirmation/${encodeURIComponent(id)}`}>Refresh status</a>}
            <Link href="/bookings">View My Bookings</Link>
          </section>
        ) : !confirmed ? (
          <section className="booking-confirmation-unavailable" role="status">
            <h1>Booking is not confirmed</h1>
            <p>
              {booking.status === "PENDING_UNKNOWN"
                ? "The provider response is still pending or unknown. Check your booking status before taking further action."
                : "This provider booking has not reached confirmed status."}
            </p>
            <Link href={`/trips/bookings/${encodeURIComponent(booking.id)}`}>View booking status</Link>
          </section>
        ) : (
          <div className="booking-confirmation-content">
            <section className="booking-confirmation-success" aria-labelledby="confirmation-heading">
              <span className="booking-confirmation-check" aria-hidden="true">✓</span>
              <p className="booking-confirmation-kicker">{isStay ? "Stay confirmed" : isExperience ? "Experience confirmed" : "Booking confirmed"}</p>
              <h1 id="confirmation-heading">{isStay ? "Your stay is all set." : isExperience ? "Your experience is all set." : "You’re all set."}</h1>
              <p className="booking-confirmation-reference">
                Reference: <strong>{booking.id}</strong>
                {booking.customer_details.contact_email && <> · Contact: {booking.customer_details.contact_email}</>}
              </p>
              <a
                className="booking-confirmation-ticket"
                href={`/api/bookings/${encodeURIComponent(booking.id)}/ticket`}
              >
                <span aria-hidden="true">↓</span> Download Mock {isStay || isExperience ? "Voucher" : "Ticket"}
              </a>
              <p className="booking-confirmation-disclaimer">
                {isStay
                  ? "Academic prototype — this simulated voucher is not a real reservation."
                  : isExperience
                    ? "Academic prototype — this simulated voucher is not a real activity booking."
                    : "Academic prototype — this simulated ticket is not valid for travel."}
              </p>
            </section>

            <section className="booking-confirmation-summary" aria-labelledby="confirmation-summary-heading">
              <p className="tag-neutral">Summary</p>
              <h2 id="confirmation-summary-heading">{booking.service || booking.provider_name || "Your booking"}</h2>
              <p className="booking-confirmation-provider">{booking.provider_name || booking.provider_id}</p>
              <dl>
                {isStay ? (
                  <>
                    <div><dt>Stay dates</dt><dd>{displayStayDates(booking)}</dd></div>
                    <div><dt>Rooms &amp; guests</dt><dd>{rooms} {rooms === 1 ? "room" : "rooms"}{guests ? ` · ${guests} ${guests === 1 ? "guest" : "guests"}` : ""}</dd></div>
                  </>
                ) : (
                  <>
                    <div><dt>Date &amp; time</dt><dd>{date} · {displaySchedule(booking)}</dd></div>
                    <div><dt>Booked for</dt><dd>{booking.quantity ?? 1} {isExperience
                      ? booking.quantity === 1 ? "participant" : "participants"
                      : booking.quantity === 1 ? "traveller" : "travellers"}</dd></div>
                  </>
                )}
                <div><dt>Total</dt><dd>{price?.currency} {price?.value}</dd></div>
              </dl>
            </section>

            <div className="booking-confirmation-actions">
              <Link className="booking-confirmation-primary" href={`/trips/bookings/${encodeURIComponent(booking.id)}`}>View booking</Link>
              <Link className="booking-confirmation-secondary" href="/trips">Add to trip</Link>
            </div>

            {place && (
              <section className="booking-confirmation-next" aria-labelledby="continue-planning-heading">
                <h2 id="continue-planning-heading">{isStay ? `Explore more in ${place}` : `Continue planning in ${place}`}</h2>
                <div>
                  <Link href={`/results?${staysParams.toString()}`}>
                    <strong>{isStay ? `Explore more stays in ${place}` : `Find stays in ${place}`}</strong>
                    <span>Explore accommodation options</span>
                  </Link>
                  <Link href={`/results?${experiencesParams.toString()}`}>
                    <strong>Explore experiences</strong>
                    <span>Discover local activities in {place}</span>
                  </Link>
                </div>
              </section>
            )}

            <p className="booking-confirmation-payment">Simulated booking only · No payment was collected.</p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
