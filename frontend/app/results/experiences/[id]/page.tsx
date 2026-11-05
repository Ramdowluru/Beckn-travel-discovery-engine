import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CategorySelectButton from "@/components/CategorySelectButton";
import type { ExperienceOption } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ transaction_id?: string; participants?: string; from?: string; to?: string; date?: string; travellers?: string; experience_date?: string; experience_category?: string }>;
}

export default async function ExperienceDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const decodedOfferId = decodeURIComponent(id);
  const query = await searchParams;
  const { transaction_id: transactionId = "", participants: participantsParam } = query;
  const participants = Math.max(1, Number(participantsParam ?? 1));
  const resultsParams = new URLSearchParams({ tab: "experiences" });
  for (const [key, value] of Object.entries({
    from: query.from,
    to: query.to,
    date: query.date,
    travellers: query.travellers,
    experience_date: query.experience_date,
    experience_category: query.experience_category,
    participants: participantsParam,
  })) {
    if (value) resultsParams.set(key, value);
  }
  const resultsHref = `/results?${resultsParams.toString()}`;

  let exp: ExperienceOption | null = null;
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    if (!host || !transactionId) notFound();
    const res = await fetch(
      `${protocol}://${host}/api/experiences/${encodeURIComponent(decodedOfferId)}?transaction_id=${encodeURIComponent(transactionId)}`,
      { cache: "no-store" },
    );
    if (res.ok) exp = (await res.json()) as ExperienceOption;
  } catch {
    /* network error — fall through to notFound */
  }

  if (!exp) notFound();

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        {/* ── Breadcrumb ──────────────────────────────────────── */}
        <div style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--white)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem", height: "44px", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Link href={resultsHref} style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.8rem", color: "var(--ink-soft)", textDecoration: "none" }}>
              Experiences
            </Link>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>→</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.8rem", color: "var(--ink)" }}>
              {exp.name}
            </span>
          </div>
        </div>

        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 2rem 5rem" }}>
          {/* ── Two-column body ─────────────────────────────────── */}
          <div className="detail-layout experience-detail-layout" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "3rem", alignItems: "start" }}>

            {/* Left */}
            <div>
              <div className="experience-detail-provider">
                <span className="experience-result-category">{exp.category} experience</span>
                <span>Hosted by {exp.provider}</span>
                <span className="experience-result-rating">★ {exp.rating}</span>
              </div>
              <h1 className="experience-detail-title">
                {exp.name}
              </h1>
              <p className="experience-detail-subtitle">
                {exp.meetingPoint} · {exp.duration}
              </p>

              <div className="experience-detail-section">
                <h2>About this experience</h2>
                <p>{exp.description}</p>
              </div>

              <div className="experience-detail-section">
                <h2>What&apos;s included</h2>
                <ul className="experience-detail-includes">
                  {exp.includes.map((item) => (
                    <li key={item}><span aria-hidden="true">✓</span>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="experience-detail-schedule">
                <div><span>Experience date</span><strong>{exp.date}</strong></div>
                <div><span>Time</span><strong>{exp.time}</strong></div>
                <div><span>Duration</span><strong>{exp.duration}</strong></div>
                <div><span>Meeting point</span><strong>{exp.meetingPoint}</strong></div>
              </div>

              <div className="experience-detail-section experience-detail-cancellation">
                <h2>Cancellation policy</h2>
                <p>{exp.cancellation}</p>
              </div>
            </div>

            {/* Right: booking panel */}
            <aside>
              <div className="experience-booking-card">
                <p className="tag-neutral">Price per participant</p>
                <p className="experience-booking-price">
                  {exp.price}
                </p>
                <div className="experience-booking-total">
                  <span>{participants} {participants === 1 ? "participant" : "participants"}</span>
                  <strong>{exp.totalPrice}</strong>
                </div>
                <p className="experience-booking-date">{exp.date} · {exp.time}</p>
                <p className="experience-booking-note">Availability and price are rechecked with the provider. Initialization does not reserve a place.</p>

                <CategorySelectButton
                  kind="experience"
                  offerId={decodedOfferId}
                  transactionId={transactionId}
                  quantity={participants}
                  peopleCount={participants}
                  priceLabel="Price per person"
                  unitPrice={exp.price}
                  totalPrice={exp.totalPrice}
                  quantityLabel={participants === 1 ? "participant" : "participants"}
                  reviewDetails={[
                    `Provider: ${exp.provider}`,
                    `Activity: ${exp.name}`,
                    `Date: ${exp.date}`,
                    `Time: ${exp.time}`,
                    `Meeting point: ${exp.meetingPoint}`,
                    `Participants: ${participants}`,
                    `Published price: ${exp.price}`,
                    `Cancellation policy: ${exp.cancellation}`,
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
