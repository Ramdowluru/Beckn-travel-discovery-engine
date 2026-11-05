import Link from "next/link";
import { headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { TransportOption } from "@/lib/types";
import TransportSelectButton from "@/components/TransportSelectButton";
import { providerDateInIndia } from "@/lib/booking-dates";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ transaction_id?: string | string[] }>;
}

export default async function TransportDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const transactionId = Array.isArray(query.transaction_id)
    ? query.transaction_id[0] ?? ""
    : query.transaction_id ?? "";
  const decodedOfferId = decodeURIComponent(id);

  let opt: TransportOption | null = null;
  let detailError = "";
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    if (!host || !transactionId) {
      detailError = "This transport offer is no longer available. Please search again.";
    } else {
      const responseUrl = `${protocol}://${host}/api/transport/${encodeURIComponent(decodedOfferId)}?transaction_id=${encodeURIComponent(transactionId)}`;
      const res = await fetch(responseUrl, { cache: "no-store" });
      if (res.ok) {
        opt = (await res.json()) as TransportOption;
      } else {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        detailError = body.detail ?? (
          res.status >= 500
            ? "Transport details are temporarily unavailable. Please try again."
            : "This transport offer is no longer available. Please search again."
        );
      }
    }
  } catch {
    detailError = "Transport details are temporarily unavailable. Please try again.";
  }

  if (!opt) {
    return (
      <>
        <Navbar />
        <main style={{ flex: 1, backgroundColor: "var(--cream)", padding: "5rem 2rem", textAlign: "center" }}>
          <h1 style={{ fontFamily: "var(--font-display)", color: "var(--ink)", marginBottom: "0.75rem" }}>
            Transport details unavailable
          </h1>
          <p style={{ fontFamily: "var(--font-body)", color: "var(--ink-soft)", marginBottom: "1.5rem" }}>
            {detailError}
          </p>
          <Link href="/results?tab=travel" style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}>
            Search again
          </Link>
        </main>
      </>
    );
  }

  const itineraryParams = new URLSearchParams({
    transaction_id: transactionId,
    offer_id: decodedOfferId,
  });
  const storedQuery = (opt as TransportOption & {
    query?: { from?: string; to?: string; date?: string; travellers?: number };
  }).query;
  const resultsParams = new URLSearchParams({ tab: "travel" });
  for (const [key, value] of Object.entries({
    from: storedQuery?.from,
    to: storedQuery?.to,
    date: storedQuery?.date,
    travellers: storedQuery?.travellers?.toString(),
  })) {
    if (value) resultsParams.set(key, value);
  }
  for (const [key, value] of Object.entries({
    from: storedQuery?.from,
    to: storedQuery?.to,
    date: storedQuery?.date,
    travellers: storedQuery?.travellers?.toString(),
  })) {
    if (value) itineraryParams.set(key, value);
  }
  const formatDate = (value: string | undefined) => value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date as selected";
  const startTimestamp = opt._beckn?.fulfillment?.start?.time?.timestamp
    || opt._beckn?.fulfillment?.start?.time?.range?.start;
  const endTimestamp = opt._beckn?.fulfillment?.end?.time?.timestamp
    || opt._beckn?.fulfillment?.end?.time?.range?.start;
  const departureDateValue = opt.departureDate || (startTimestamp ? providerDateInIndia(startTimestamp) : "") || storedQuery?.date;
  const arrivalDateValue = opt.arrivalDate || (endTimestamp ? providerDateInIndia(endTimestamp) : "");
  const departureDate = formatDate(departureDateValue);
  const arrivalDate = arrivalDateValue ? formatDate(arrivalDateValue) : "Date not supplied";

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb bar ──────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div className="offer-breadcrumb-inner" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href="/results?tab=travel" style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
              Results
            </Link>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>→</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink)" }}>
              {opt.provider}
            </span>
          </div>
        </div>

        <div className="detail-layout transport-detail-layout" style={{ maxWidth: "1200px", margin: "0 auto", padding: "3rem 2rem 5rem", display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

          {/* ── Left ──────────────────────────────────────────── */}
          <div>
            <section className="offer-summary-card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <p className="tag" style={{ margin: 0 }}>{opt.type}</p>
              </div>
              <h1 className="offer-title" style={{ fontFamily: "var(--font-display)", fontWeight: 500, color: "var(--ink)", marginBottom: "0.25rem" }}>
                {opt.provider}
              </h1>
              <p className="offer-subtitle" style={{ fontFamily: "var(--font-body)", fontWeight: 300, color: "var(--ink-soft)" }}>
                {opt.departureCity} → {opt.arrivalCity} · {opt.provider}
              </p>

            <div className="offer-route-grid">
              <div className="offer-route-point">
                <p className="eyebrow">Departure</p>
                <p className="offer-route-time">{opt.departure}</p>
                <p className="offer-route-caption">{opt.departureCity} · {departureDateValue ? `${departureDate} IST` : departureDate}</p>
              </div>
              <div className="offer-route-duration">
                <p className="eyebrow">Duration</p>
                <p>{opt.duration}{opt.stops && opt.stops !== "Non-stop" ? ` · ${opt.stops}` : ""}</p>
              </div>
              <div className="offer-route-point offer-route-arrival">
                <p className="eyebrow">Arrival</p>
                <p className="offer-route-time">{opt.arrival}</p>
                <p className="offer-route-caption">{opt.arrivalCity} · {arrivalDateValue ? `${arrivalDate} IST` : arrivalDate}</p>
              </div>
            </div>
            </section>

            <section className="offer-info-card">
              <p className="tag-neutral">About this service</p>
              <p className="offer-body-copy">{opt.description}</p>
            </section>

            <section className="offer-info-card">
              <p className="tag-neutral">Availability</p>
              <p className="offer-body-copy">Availability will be checked when you continue. Continuing does not reserve inventory.</p>
            </section>

            <section className="offer-info-card">
              <p className="tag-neutral">Included</p>
              <ul className="offer-inclusions">
                {opt.amenities.map((amenity) => (
                  <li key={amenity}><span aria-hidden="true">✓</span>{amenity}</li>
                ))}
              </ul>
            </section>

            <section className="offer-info-card">
              <p className="tag-neutral">Cancellation policy</p>
              <p className="offer-body-copy">{opt.cancellation}</p>
            </section>

            {/* Kept as provider-disclosed information, separate from the offer terms. */}
            <section className="offer-info-card offer-provider-note">
              <p className="tag-neutral">Provider information</p>
              <p className="offer-body-copy">{opt.providerNote}</p>
            </section>
          </div>

          {/* ── Right: booking panel ──────────────────────────── */}
          <aside>
            <div className="offer-price-panel">
              <p className="tag-neutral">Price per person</p>
              <p className="offer-price">{opt.currency} {opt.unitPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
              <div className="offer-price-rows">
                <div><span>Travellers</span><strong>{opt.travellerCount}</strong></div>
                <div><span>Availability</span><strong>Checked when you continue</strong></div>
                <div className="offer-total-row"><span>Estimated total</span><strong>{opt.currency} {opt.totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
              </div>
              <p className="offer-simulation-note">Simulated booking only · No payment is collected</p>

              <TransportSelectButton
                offerId={decodedOfferId}
                transactionId={transactionId}
                quantity={opt.travellerCount}
                currency={opt.currency}
                unitPrice={opt.unitPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                totalPrice={opt.totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                reviewDetails={[
                  `Provider: ${opt.provider}`,
                  `Service: ${opt.type}`,
                  `Route: ${opt.departureCity} → ${opt.arrivalCity}`,
                  `Departure: ${departureDateValue ? `${departureDate} · ` : "Date not supplied · "}${opt.departure} IST`,
                  `Arrival: ${arrivalDateValue ? `${arrivalDate} · ` : "Date not supplied · "}${opt.arrival} IST`,
                  `Passengers: ${opt.travellerCount}`,
                  `Published fare: ${opt.currency} ${opt.unitPrice} per passenger`,
                ]}
              />
              <Link
                href={`/itinerary?${itineraryParams.toString()}`}
                className="offer-secondary-action"
              >
                Save itinerary instead
              </Link>
              <Link
                href={`/results?${resultsParams.toString()}`}
                className="offer-secondary-action"
              >
                Back to results
              </Link>

            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
