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
          {stay.images.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "2px", marginBottom: "2.5rem", height: "320px" }}>
              {stay.images.slice(0, 3).map((img, i) => (
                <div key={i} style={{ overflow: "hidden", backgroundColor: "var(--cream-dark)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={stay!.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
              ))}
            </div>
          )}

          {/* ── Two-column body ─────────────────────────────────── */}
          <div className="detail-layout" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

            {/* Left */}
            <div>
              <div style={{ marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)" }}>{stay.provider}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--orange)", fontWeight: 500 }}>★ {stay.rating}</span>
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.25rem" }}>
                {stay.name}
              </h1>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.875rem", color: "var(--ink-soft)", marginBottom: "2rem" }}>
                {stay.location}
              </p>

              {/* Description */}
              <div style={{ marginBottom: "2rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>About this stay</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
                  {stay.description}
                </p>
              </div>

              {/* Amenities */}
              <div style={{ marginBottom: "2rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Amenities</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {stay.amenities.map((a) => (
                    <span key={a} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "0.3rem 0.75rem" }}>
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              {/* Check-in / out */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", border: "1px solid var(--border)", marginBottom: "2rem" }}>
                {[{ label: "Check-in", value: stay.checkIn }, { label: "Check-out", value: stay.checkOut }].map((item) => (
                  <div key={item.label} style={{ backgroundColor: "var(--white)", padding: "1rem 1.25rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.3rem" }}>{item.label}</p>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1rem", color: "var(--ink)" }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="offer-facts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1px", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
                <div style={{ backgroundColor: "var(--white)", padding: "1rem 1.25rem" }}>
                  <p className="tag-neutral" style={{ marginBottom: "0.3rem" }}>Availability</p>
                  <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Checked when you continue</p>
                </div>
                <div style={{ backgroundColor: "var(--white)", padding: "1rem 1.25rem" }}>
                  <p className="tag-neutral" style={{ marginBottom: "0.3rem" }}>Quantity</p>
                  <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>{rooms} {rooms === 1 ? "room" : "rooms"} · {guests} {guests === 1 ? "guest" : "guests"}</p>
                </div>
              </div>

              {/* Cancellation */}
              <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1rem 1.25rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.4rem" }}>Cancellation policy</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.85rem", color: "var(--ink-soft)" }}>{stay.cancellation}</p>
              </div>
            </div>

            {/* Right: booking panel */}
            <aside>
              <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "1.75rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.5rem" }}>Price per night</p>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2.25rem", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.25rem" }}>
                  {stay.pricePerNight}
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "0.5rem" }}>
                  {stay.totalPrice} total · {stay.nights} nights
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "1.75rem" }}>
                  Simulated quote only · No payment or inventory reservation
                </p>

                <CategorySelectButton
                  kind="hotel"
                  offerId={decodedOfferId}
                  transactionId={transactionId}
                  quantity={rooms}
                  peopleCount={guests}
                  roomCount={rooms}
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
