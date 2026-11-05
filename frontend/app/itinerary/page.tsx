import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { forwardTransportRequest } from "@/lib/serverBackend";
import type { TransportOption } from "@/lib/types";
import SaveItineraryButton from "@/components/SaveItineraryButton";

interface ItineraryQuery {
  transaction_id?: string | string[];
  offer_id?: string | string[];
  from?: string | string[];
  to?: string | string[];
  date?: string | string[];
  travellers?: string | string[];
}

interface Props {
  searchParams: Promise<ItineraryQuery>;
}

interface StoredQuery {
  from: string;
  to: string;
  date: string;
  travellers: number;
}

type StoredTransport = TransportOption & {
  query: StoredQuery;
  transaction_id: string;
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function searchHref(query?: StoredQuery): string {
  const params = new URLSearchParams({ tab: "travel" });
  if (query) {
    params.set("from", query.from);
    params.set("to", query.to);
    params.set("date", query.date);
    params.set("travellers", String(query.travellers));
  }
  return `/results?${params.toString()}`;
}

function queryFromParams(params: ItineraryQuery): StoredQuery | undefined {
  const from = firstValue(params.from);
  const to = firstValue(params.to);
  const date = firstValue(params.date);
  const travellers = Number(firstValue(params.travellers));
  if (!from || !to || !date || !Number.isInteger(travellers) || travellers < 1) {
    return undefined;
  }
  return { from, to, date, travellers };
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

function ErrorState({ message, query }: { message: string; query?: StoredQuery }) {
  return (
    <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "3rem 2rem", textAlign: "center" }}>
      <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-muted)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
        {message}
      </p>
      <Link href={searchHref(query)} style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.825rem", letterSpacing: "0.04em", color: "var(--white)", backgroundColor: "var(--ink)", padding: "0.7rem 1.5rem", textDecoration: "none", display: "inline-block" }}>
        Search again
      </Link>
    </div>
  );
}

export default async function ItineraryPage({ searchParams }: Props) {
  const params = await searchParams;
  const transactionId = firstValue(params.transaction_id);
  const offerId = firstValue(params.offer_id);
  let transport: StoredTransport | null = null;
  let state: "empty" | "unavailable" | "error" = "empty";

  if (transactionId && offerId) {
    const response = await forwardTransportRequest(offerId, transactionId);
    if (response.ok) {
      transport = await response.json() as StoredTransport;
    } else {
      state = response.status >= 500 ? "error" : "unavailable";
    }
  }

  const query = transport?.query;
  const returnHref = searchHref(query ?? queryFromParams(params));

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "3.5rem 2rem 5rem" }}>
          <p className="tag" style={{ marginBottom: "0.75rem" }}>Your trip</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(2rem, 4vw, 3rem)", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.6rem" }}>
            Your itinerary
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)", marginBottom: "3rem", maxWidth: "480px", lineHeight: 1.6 }}>
            This anonymous draft is backed by your expiring search result.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>
            <div>
              {state === "empty" && !transport && (
                <ErrorState message="Your itinerary is empty. Search for a trip and select a transport option." />
              )}
              {state === "unavailable" && (
                <ErrorState message="This transport offer is no longer available. Please search again." />
              )}
              {state === "error" && (
                <ErrorState message="Transport details are temporarily unavailable. Please try again." query={query} />
              )}
              {transport && query && (
                <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "2rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", marginBottom: "1.75rem" }}>
                    <div>
                      <p className="tag-neutral" style={{ marginBottom: "0.5rem" }}>{transport.type}</p>
                      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.5rem", color: "var(--ink)", marginBottom: "0.35rem" }}>{transport.provider}</h2>
                      <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.875rem", color: "var(--ink-soft)" }}>{transport.departureCity} → {transport.arrivalCity}</p>
                    </div>
                    <Link href={returnHref} style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--ink-soft)", textDecoration: "underline" }}>Change</Link>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "1.25rem 0", display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1rem", alignItems: "center" }}>
                    <div>
                      <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.75rem", color: "var(--ink)" }}>{transport.departure}</p>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>{transport.departureCity}</p>
                    </div>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--ink-muted)", textAlign: "center" }}>{transport.duration}</p>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.75rem", color: "var(--ink)" }}>{transport.arrival}</p>
                      <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>{transport.arrivalCity}</p>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: "0.65rem", marginTop: "1.5rem", fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                    <p><strong>Travel date:</strong> {formatDate(query.date)}</p>
                    <p><strong>Travellers:</strong> {transport.travellerCount}</p>
                    <p><strong>Times:</strong> IST</p>
                  </div>
                  <Link href={returnHref} style={{ display: "inline-block", marginTop: "1.75rem", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: "0.8rem", textDecoration: "underline" }}>
                    Back to search
                  </Link>
                </div>
              )}
            </div>

            <aside>
              <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "1.75rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.1rem", color: "var(--ink)", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
                  Price breakdown
                </h2>
                {transport ? (
                  <>
                    <p style={{ fontFamily: "var(--font-body)", fontSize: "0.825rem", color: "var(--ink-soft)", marginBottom: "0.5rem" }}>
                      {transport.currency} {transport.unitPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })} per person
                    </p>
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem" }}>
                      <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "0.9rem", color: "var(--ink)" }}>Total</span>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.4rem", color: "var(--ink)" }}>{transport.currency} {transport.totalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                    </div>
                    <SaveItineraryButton transactionId={transport.transaction_id} offerId={transport.id} />
                    <Link href="/itinerary" style={{ display: "block", width: "100%", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: "0.8rem", textAlign: "center", padding: "0.8rem 0", border: "1px solid var(--border)", textDecoration: "none", marginBottom: "0.75rem" }}>
                      Remove transport
                    </Link>
                  </>
                ) : (
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-muted)", marginBottom: "1.25rem" }}>
                    No items selected yet.
                  </p>
                )}
                <button disabled style={{ display: "block", width: "100%", backgroundColor: "var(--ink-muted)", color: "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", border: "none", padding: "0.9rem 0", cursor: "not-allowed" }}>
                  Continue to checkout
                </button>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
