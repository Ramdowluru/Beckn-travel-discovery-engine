import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingManagement from "@/components/BookingManagement";
import { serverApiFetch } from "@/lib/serverApi";
import type { BookingRecord } from "@/lib/api";

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

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  let booking: BookingRecord | null = null;
  try {
    booking = await serverApiFetch<BookingRecord>(`/api/bookings/${encodeURIComponent(id)}`);
  } catch {
    booking = null;
  }
  const cancelled = booking?.status === "CANCELLED";
  const confirmed = booking?.status === "CONFIRMED" && !cancelled;
  const quote = booking?.quote?.price;
  const names = booking ? customerNames(booking) : [];
  const roomAssignments = booking?.customer_details.room_assignments ?? [];

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "3.5rem 2rem 5rem" }}>
          <Link href="/trips" style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
            ← My bookings
          </Link>
          {!booking ? (
            <section style={{ marginTop: "2rem", padding: "2rem", background: "var(--white)", border: "1px solid var(--border)" }}>
              <h1 style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>Booking unavailable</h1>
              <p style={{ marginTop: "0.5rem", color: "var(--ink-soft)" }}>This booking was not found or is not available to this account.</p>
            </section>
          ) : (
            <article style={{ marginTop: "2rem", padding: "2rem", background: "var(--white)", border: "1px solid var(--border)" }}>
              <p className="tag-neutral">{booking.kind} booking · {booking.status.replaceAll("_", " ")}</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", marginTop: "0.4rem" }}>
                {booking.service || "Provider booking"}
              </h1>
              <div style={{ display: "grid", gap: "0.65rem", marginTop: "1.25rem", color: "var(--ink-soft)", fontFamily: "var(--font-body)" }}>
                <p><strong>Provider:</strong> {booking.provider_name || booking.provider_id}</p>
                <p><strong>Provider reference:</strong> {booking.provider_order_id || "Not received yet"}</p>
                <p><strong>Location / route:</strong> {bookingLocation(booking) || "Not specified"}</p>
                {booking.display.type && <p><strong>Service type:</strong> {booking.display.type}</p>}
                {booking.display.date && <p><strong>Date:</strong> {booking.display.date}</p>}
                {booking.display.time && <p><strong>Time:</strong> {booking.display.time}</p>}
                {booking.display.departure && <p><strong>Departure:</strong> {booking.display.departure}</p>}
                {booking.display.arrival && <p><strong>Arrival:</strong> {booking.display.arrival}</p>}
                {booking.display.checkIn && <p><strong>Check-in:</strong> {booking.display.checkIn}</p>}
                {booking.display.checkOut && <p><strong>Check-out:</strong> {booking.display.checkOut}</p>}
                <p><strong>Quantity:</strong> {booking.quantity ?? "—"}</p>
                <p><strong>Customers:</strong> {names.length ? names.map((name, index) => {
                  const room = roomAssignments[index];
                  return room ? `${name} (Room ${room})` : name;
                }).join(", ") : "Details unavailable"}</p>
                {booking.customer_details.contact_email && <p><strong>Lead contact:</strong> {booking.customer_details.contact_email}</p>}
                {booking.customer_details.contact_phone && <p><strong>Contact phone:</strong> {booking.customer_details.contact_phone}</p>}
                <p><strong>Final price:</strong> {quote?.currency} {quote?.value}</p>
                {booking.quote?.breakup?.map((line, index) => (
                  <p key={`${line.title ?? "line"}-${index}`}>
                    {line.title}: {line.price?.currency} {line.price?.value}
                  </p>
                ))}
                <p><strong>Simulated payment status:</strong> Not paid; no payment was collected.</p>
              </div>
              {booking.status === "INITIALIZED" && <p role="status" style={{ marginTop: "1rem" }}>Initialized only. This does not confirm the booking or reserve inventory.</p>}
              {booking.status === "PENDING_UNKNOWN" && <p role="status" style={{ marginTop: "1rem" }}>Provider outcome is pending or unknown; use status refresh to reconcile safely.</p>}
              {booking.status === "REJECTED" && <p role="alert" style={{ marginTop: "1rem" }}>The provider rejected the latest booking action. No successful booking is shown.</p>}
              {cancelled && <p role="status" style={{ marginTop: "1rem" }}>Booking cancelled. This mock booking was unpaid; refund is not applicable.</p>}
              {confirmed && (
                <a
                  href={`/api/bookings/${encodeURIComponent(booking.id)}/ticket`}
                  style={{ display: "inline-block", marginTop: "1.25rem", padding: "0.7rem 1rem", background: "var(--ink)", color: "var(--white)", textDecoration: "none", fontFamily: "var(--font-body)" }}
                >
                  Download mock ticket / voucher
                </a>
              )}
              {confirmed && <p style={{ marginTop: "0.65rem", fontSize: "0.78rem", color: "var(--orange)" }}>Academic prototype — not valid for travel.</p>}
              <BookingManagement booking={booking} />
            </article>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
