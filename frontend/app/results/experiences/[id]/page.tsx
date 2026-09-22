import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { experienceOptions } from "@/lib/mockData";
import { buildSearchHref, type PageSearchParams } from "@/lib/searchParams";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const experience = experienceOptions.find((item) => item.id === id);
  return {
    title: experience ? `${experience.name} experience` : "Experience details",
    description: experience?.description,
  };
}

export default async function ExperienceDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const currentSearchParams = await searchParams;
  const exp = experienceOptions.find((e) => e.id === id);
  if (!exp) notFound();

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb ──────────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href={buildSearchHref("/results", "experiences", currentSearchParams)} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
              Experiences
            </Link>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>→</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink)" }}>
              {exp.name}
            </span>
          </div>
        </div>

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "3rem 2rem 5rem" }}>

          {/* ── Hero image ──────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "2px", marginBottom: "2.5rem", height: "340px" }}>
            {exp.images.slice(0, 2).map((img, i) => (
              <div key={i} style={{ overflow: "hidden", backgroundColor: "var(--cream-dark)", position: "relative" }}>
                <Image src={img} alt={exp.name} fill sizes="(max-width: 760px) 100vw, 40vw" style={{ objectFit: "cover" }} />
              </div>
            ))}
          </div>

          {/* ── Two-column body ─────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

            {/* Left */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                  Hosted by {exp.provider}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--orange)", fontWeight: 500 }}>★ {exp.rating}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--ink-muted)", letterSpacing: "0.06em" }}>{exp.category.toUpperCase()}</span>
              </div>
              <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2rem", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.25rem" }}>
                {exp.name}
              </h1>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.875rem", color: "var(--ink-soft)", marginBottom: "2rem" }}>
                Duration: {exp.duration}
              </p>

              {/* Description */}
              <div style={{ marginBottom: "2rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>About this experience</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
                  {exp.description}
                </p>
              </div>

              {/* What's included */}
              <div style={{ marginBottom: "2rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>What&apos;s included</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {exp.includes.map((item) => (
                    <span key={item} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "0.3rem 0.75rem" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Meeting point */}
              <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.4rem" }}>Meeting point</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.875rem", color: "var(--ink)" }}>{exp.meetingPoint}</p>
              </div>

              {/* Cancellation */}
              <div style={{ backgroundColor: "var(--white)", border: "1px solid var(--border)", padding: "1rem 1.25rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.4rem" }}>Cancellation policy</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.85rem", color: "var(--ink-soft)" }}>{exp.cancellation}</p>
              </div>
            </div>

            {/* Right: booking panel */}
            <aside>
              <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "1.75rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.5rem" }}>Price per person</p>
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "2.25rem", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "0.25rem" }}>
                  {exp.price}
                </p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: "1.75rem" }}>
                  No booking fee · Pay provider directly
                </p>

                <Link
                  href={buildSearchHref("/itinerary", "experiences", currentSearchParams, { experience: exp.id })}
                  style={{ display: "block", width: "100%", backgroundColor: "var(--ink)", color: "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem", letterSpacing: "0.06em", textTransform: "uppercase", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", marginBottom: "0.75rem" }}
                >
                  Add to journey
                </Link>
                <Link
                  href={buildSearchHref("/results", "experiences", currentSearchParams)}
                  style={{ display: "block", width: "100%", backgroundColor: "transparent", color: "var(--ink)", fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.875rem", textDecoration: "none", textAlign: "center", padding: "0.9rem 0", border: "1px solid var(--border)" }}
                >
                  Back to results
                </Link>

                <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.25rem", paddingTop: "1.25rem" }}>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.72rem", color: "var(--ink-muted)", lineHeight: 1.6 }}>
                    {exp.providerNote}
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
