import Link from "next/link";
import { headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { TransportOption } from "@/lib/types";
import TransportSelectButton from "@/components/TransportSelectButton";

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

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb bar ──────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href="/results?tab=travel" style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
              Travel results
            </Link>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>→</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink)" }}>
              {opt.provider}
            </span>
          </div>
        </div>

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "3rem 2rem 5rem", display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

          {/* ── Left ──────────────────────────────────────────── */}
          <div>
            <div style={{ marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <p className="tag-neutral" style={{ fontSize: "0.6rem" }}>{opt.type}</p>
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.25rem" }}>
                {opt.provider}
              </h1>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)" }}>
                {opt.departureCity} → {opt.arrivalCity}
              </p>
            </div>

            {/* Route card */}
            <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1.5rem 2rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "1rem" }}>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", letterSpacing: "-0.03em" }}>{opt.departure}</p>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>{opt.departureCity}</p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ink-muted)", marginBottom: "0.4rem" }}>{opt.duration} · {opt.stops}</p>
                  <div style={{ height: "1px", backgroundColor: "var(--border)", position: "relative" }}>
                    <div style={{ position: "absolute", right: 0, top: "-3px", width: "7px", height: "7px", backgroundColor: "var(--ink-soft)" }} />
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", letterSpacing: "-0.03em" }}>{opt.arrival}</p>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)" }}>{opt.arrivalCity}</p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: "2rem" }}>
              <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>About this service</p>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
                {opt.description}
              </p>
            </div>

            {/* Amenities */}
            <div style={{ marginBottom: "2rem" }}>
              <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>Included</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {opt.amenities.map((a) => (
                  <span key={a} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "0.3rem 0.75rem" }}>
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* Cancellation */}
            <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1rem 1.25rem" }}>
              <p className="tag-neutral" style={{ marginBottom: "0.4rem" }}>Cancellation policy</p>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.85rem", color: "var(--ink-soft)" }}>{opt.cancellation}</p>
            </div>
          </div>

          {/* ── Right: booking panel ──────────────────────────── */}
          <aside>
            <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "1.75rem" }}>
              <p className="tag-neutral" style={{ marginBottom: "0.5rem" }}>Price per person</p>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2.25rem", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.25rem" }}>
                {opt.currency} {opt.unitPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per person
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-muted)", marginBottom: "1.75rem" }}>
                {opt.currency} {opt.totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} total for {opt.travellerCount} {opt.travellerCount === 1 ? "traveller" : "travellers"}
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "1.75rem" }}>
                Simulated booking only · No payment is collected
              </p>

              <TransportSelectButton
                offerId={decodedOfferId}
                transactionId={transactionId}
                quantity={opt.travellerCount}
                reviewDetails={[
                  `Provider: ${opt.provider}`,
                  `Service: ${opt.type}`,
                  `Route: ${opt.departureCity} → ${opt.arrivalCity}`,
                  `Date: ${storedQuery?.date ?? "As selected"}`,
                  `Time: ${opt.departure} – ${opt.arrival}`,
                  `Passengers: ${opt.travellerCount}`,
                  `Published fare: ${opt.currency} ${opt.unitPrice} per passenger`,
                ]}
              />
              <Link
                href={`/itinerary?${itineraryParams.toString()}`}
                style={{ display: "block", width: "100%", backgroundColor: "transparent", color: "var(--ink)", fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.875rem", letterSpacing: "0.04em", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", marginBottom: "0.75rem", border: "1px solid var(--border)" }}
              >
                Save itinerary instead
              </Link>
              <Link
                href={`/results?${resultsParams.toString()}`}
                style={{ display: "block", width: "100%", backgroundColor: "transparent", color: "var(--ink)", fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.875rem", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", border: "1px solid var(--border)" }}
              >
                Back to results
              </Link>

              <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem", paddingTop: "1.25rem" }}>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.72rem", color: "var(--ink-muted)", lineHeight: 1.6 }}>
                  {opt.providerNote}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
