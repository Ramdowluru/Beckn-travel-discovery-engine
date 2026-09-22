import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { transportOptions } from "@/lib/mockData";
import { buildSearchHref, type PageSearchParams } from "@/lib/searchParams";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const option = transportOptions.find((item) => item.id === id);
  return {
    title: option ? `${option.provider} transport` : "Transport details",
    description: option?.description,
  };
}

export default async function TransportDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const currentSearchParams = await searchParams;
  const opt = transportOptions.find((t) => t.id === id);
  if (!opt) notFound();

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb bar ──────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href={buildSearchHref("/results", "travel", currentSearchParams)} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
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
            {/* Header */}
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
                {opt.price}
              </p>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "1.75rem" }}>
                No booking fee · Pay provider directly
              </p>

              <Link
                href={buildSearchHref("/itinerary", "travel", currentSearchParams, { transport: opt.id })}
                style={{ display: "block", width: "100%", backgroundColor: "var(--ink)", color: "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", marginBottom: "0.75rem" }}
              >
                Select this option
              </Link>
              <Link
                href={buildSearchHref("/results", "travel", currentSearchParams)}
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
