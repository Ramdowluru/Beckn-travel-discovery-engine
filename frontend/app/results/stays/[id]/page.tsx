import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { stayOptions } from "@/lib/mockData";
import { buildSearchHref, type PageSearchParams } from "@/lib/searchParams";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const stay = stayOptions.find((item) => item.id === id);
  return {
    title: stay ? `${stay.name} stay` : "Stay details",
    description: stay?.description,
  };
}

export default async function StayDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const currentSearchParams = await searchParams;
  const stay = stayOptions.find((s) => s.id === id);
  if (!stay) notFound();
  const galleryImages = (stay.images.length > 0 ? stay.images : [stay.image]).slice(0, 3);
  const galleryColumns = galleryImages.length === 1
    ? "1fr"
    : galleryImages.length === 2
      ? "1fr 1fr"
      : "2fr 1fr 1fr";

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb ──────────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href={buildSearchHref("/results", "stays", currentSearchParams)} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
              Stays results
            </Link>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>→</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink)" }}>
              {stay.name}
            </span>
          </div>
        </div>

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "3rem 2rem 5rem" }}>

          {/* ── Hero image ──────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: galleryColumns, gap: "2px", marginBottom: "2.5rem", height: "320px" }}>
            {galleryImages.map((img, i) => (
              <div key={i} style={{ overflow: "hidden", backgroundColor: "var(--cream-dark)", position: "relative" }}>
                <Image src={img} alt={stay.name} fill sizes="(max-width: 760px) 100vw, 33vw" style={{ objectFit: "cover" }} />
              </div>
            ))}
          </div>

          {/* ── Two-column body ─────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

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
                  No booking fee · Pay provider directly
                </p>

                <Link
                  href={buildSearchHref("/itinerary", "stays", currentSearchParams, { stay: stay.id })}
                  style={{ display: "block", width: "100%", backgroundColor: "var(--ink)", color: "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", marginBottom: "0.75rem" }}
                >
                  Select this stay
                </Link>
                <Link
                  href={buildSearchHref("/results", "stays", currentSearchParams)}
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
