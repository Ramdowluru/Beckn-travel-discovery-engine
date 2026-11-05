import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CategorySelectButton from "@/components/CategorySelectButton";
import type { StayOption } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ transaction_id?: string; rooms?: string; guests?: string; from?: string; to?: string; date?: string; travellers?: string; check_in?: string; check_out?: string }>;
}

export default async function StayDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const decodedOfferId = decodeURIComponent(id);
  const query = await searchParams;
  const { transaction_id: transactionId = "", rooms: roomsParam, guests: guestsParam } = query;
  const rooms = Math.max(1, Number(roomsParam ?? 1));
  const guests = Math.max(1, Number(guestsParam ?? 1));
  const resultsParams = new URLSearchParams({ tab: "stays" });
  for (const [key, value] of Object.entries({
    from: query.from,
    to: query.to,
    date: query.date,
    travellers: query.travellers,
    check_in: query.check_in,
    check_out: query.check_out,
    rooms: roomsParam,
    guests: guestsParam,
  })) {
    if (value) resultsParams.set(key, value);
  }
  const resultsHref = `/results?${resultsParams.toString()}`;

  let stay: StayOption | null = null;
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    if (!host || !transactionId) notFound();
    const res = await fetch(
      `${protocol}://${host}/api/stays/${encodeURIComponent(decodedOfferId)}?transaction_id=${encodeURIComponent(transactionId)}`,
      { cache: "no-store" },
    );
    if (res.ok) stay = (await res.json()) as StayOption;
  } catch {
    /* network error — fall through to notFound */
  }

  if (!stay) notFound();

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb ──────────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href={resultsHref} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
              Stays results
            </Link>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>→</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink)" }}>
              {stay.name}
            </span>
          </div>
        </div>

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "3rem 2rem 5rem" }}>

          {/* ── Hero images ─────────────────────────────────────── */}
          {/* ── Two-column body ─────────────────────────────────── */}
          <div className="detail-layout stay-detail-layout" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

            {/* Left */}
            <div>
              <div className="stay-detail-provider">
                <span className="stay-detail-category">Stay</span>
                <span>{stay.provider}</span>
                <span className="stay-result-rating">★ {stay.rating}</span>
              </div>
              <h1 className="stay-detail-title">
                {stay.name}
              </h1>
              <p className="stay-detail-location">
                {stay.location}
              </p>

              {/* Description */}
              <div className="stay-detail-section">
                <h2>About this stay</h2>
                <p>
                  {stay.description}
                </p>
              </div>

              {/* Amenities */}
              <div className="stay-detail-section">
                <h2>What this place offers</h2>
                <ul className="stay-detail-amenities">
                  {stay.amenities.map((a) => (
                    <li key={a}><span aria-hidden="true">✓</span>{a}</li>
                  ))}
                </ul>
              </div>

              {/* Check-in / out */}
              <div className="stay-detail-dates">
                {[{ label: "Check-in", value: stay.checkIn }, { label: "Check-out", value: stay.checkOut }].map((item) => (
                  <div key={item.label}>
                    <p>{item.label}</p>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div className="stay-detail-section stay-cancellation">
                <h2>Cancellation policy</h2>
                <p>{stay.cancellation}</p>
              </div>
            </div>

            {/* Right: booking panel */}
            <aside>
              <div className="stay-booking-card">
                <p className="tag-neutral">Price per room per night</p>
                <p className="stay-booking-nightly">
                  {stay.pricePerNight}
                </p>
                <div className="stay-booking-total"><span>{rooms} {rooms === 1 ? "room" : "rooms"} · {stay.nights} nights</span><strong>{stay.totalPrice}</strong></div>
                <p className="stay-booking-dates">{stay.checkIn} – {stay.checkOut} · {guests} {guests === 1 ? "guest" : "guests"}</p>
                <p className="stay-booking-note">Availability and price are rechecked with the provider. Initialization does not reserve inventory.</p>

                <CategorySelectButton
                  kind="hotel"
                  offerId={decodedOfferId}
                  transactionId={transactionId}
                  quantity={rooms}
                  peopleCount={guests}
                  roomCount={rooms}
                  priceLabel="Price per room per night"
                  unitPrice={stay.pricePerNight}
                  totalPrice={stay.totalPrice}
                  summaryQuantity={rooms * stay.nights}
                  quantityLabel={rooms * stay.nights === 1 ? "room-night" : "room-nights"}
                  reviewDetails={[
                    `Provider: ${stay.provider}`,
                    `Stay: ${stay.name}`,
                    `Location: ${stay.location}`,
                    `Check-in: ${stay.checkIn}`,
                    `Check-out: ${stay.checkOut}`,
                    `Rooms: ${rooms}`,
                    `Guests: ${guests}`,
                    `Published nightly rate: ${stay.pricePerNight}`,
                  ]}
                />
                <Link
                  href={resultsHref}
                  style={{ display: "block", width: "100%", backgroundColor: "transparent", color: "var(--ink)", fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.875rem", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", border: "1px solid var(--border)" }}
                >
                  Back to results
                </Link>

                <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem", paddingTop: "1.25rem" }}>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.72rem", color: "var(--ink-muted)", lineHeight: 1.6 }}>
                    {stay.providerNote}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
