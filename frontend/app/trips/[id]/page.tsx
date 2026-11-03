import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { serverApiFetch } from "@/lib/serverApi";
import type { SavedItinerary } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
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

export default async function SavedItineraryPage({ params }: Props) {
  const { id } = await params;
  let itinerary: SavedItinerary | null = null;
  let unavailable = false;
  try {
    itinerary = await serverApiFetch<SavedItinerary>(`/api/itineraries/${encodeURIComponent(id)}`);
  } catch {
    unavailable = true;
  }

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "3.5rem 2rem 5rem" }}>
          <Link href="/trips" style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--ink-soft)" }}>
            ← My trips
          </Link>
          {!itinerary && (
            <div style={{ marginTop: "2rem", border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "3rem 2rem", textAlign: "center" }}>
              <h1 style={{ fontFamily: "var(--font-display)", color: "var(--ink)", marginBottom: "0.75rem" }}>
                {unavailable ? "Saved itinerary unavailable" : "Saved itinerary not found"}
              </h1>
              <p style={{ fontFamily: "var(--font-body)", color: "var(--ink-soft)", marginBottom: "1.5rem" }}>
                {unavailable ? "Please sign in and try again." : "This itinerary may have been removed."}
              </p>
              <Link href="/trips" style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }}>Back to my trips</Link>
            </div>
          )}
          {itinerary && (
            <div style={{ marginTop: "2rem", border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "2rem" }}>
              <p className="tag-neutral" style={{ marginBottom: "0.5rem" }}>{itinerary.transport.type}</p>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", marginBottom: "0.35rem" }}>
                {itinerary.transport.provider}
              </h1>
              <p style={{ fontFamily: "var(--font-body)", color: "var(--ink-soft)", marginBottom: "1.75rem" }}>
                {itinerary.query.from} → {itinerary.query.to}
              </p>
              <div style={{ display: "grid", gap: "0.7rem", fontFamily: "var(--font-body)", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                <p><strong>Travel date:</strong> {formatDate(itinerary.query.date)}</p>
                <p><strong>Times:</strong> {itinerary.transport.departure} – {itinerary.transport.arrival} IST</p>
                <p><strong>Travellers:</strong> {itinerary.query.travellers}</p>
                <p><strong>Price:</strong> {itinerary.transport.currency} {itinerary.transport.unitPrice} per person</p>
                <p><strong>Total estimate:</strong> {itinerary.transport.currency} {itinerary.transport.totalPrice}</p>
              </div>
              <p style={{ marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", fontFamily: "var(--font-body)", color: "var(--ink-muted)", fontSize: "0.8rem", lineHeight: 1.6 }}>
                Saved estimate — prices require revalidation before any future booking. Checkout is not available yet.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
