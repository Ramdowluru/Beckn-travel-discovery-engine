import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const categories = [
  {
    title: "Transport",
    body: "Compare flights, trains and buses to find a route that fits your time and budget.",
    href: "/results?tab=travel",
    label: "Explore transport",
  },
  {
    title: "Hotels",
    body: "Find comfortable stays in the right location, from simple rooms to memorable getaways.",
    href: "/results?tab=stays",
    label: "Browse stays",
  },
  {
    title: "Local experiences",
    body: "Add something special to your trip with food, culture and activities led by local hosts.",
    href: "/results?tab=experiences",
    label: "Find experiences",
  },
];

const steps = [
  ["01", "Tell us where you are going", "Choose your starting point, destination, date and travellers."],
  ["02", "Compare your options", "See transport, stays and experiences together so planning feels simple."],
  ["03", "Choose what suits you", "Review the details, pick your favourites and book directly with the provider."],
];

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "5rem 2rem 5.5rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(280px, 0.9fr)",
            gap: "4rem",
            alignItems: "end",
          }}
          className="about-hero"
        >
          <div>
            <p className="tag" style={{ marginBottom: "1.25rem" }}>About TDE</p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "clamp(2.5rem, 6vw, 4.75rem)",
                color: "var(--ink)",
                letterSpacing: "-0.04em",
                lineHeight: 1,
                maxWidth: "680px",
                marginBottom: "1.5rem",
              }}
            >
              Make more of
              <br />
              <em style={{ fontStyle: "italic", fontWeight: 400, color: "var(--ink-soft)" }}>
                every journey.
              </em>
            </h1>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "1rem",
                color: "var(--ink-soft)",
                lineHeight: 1.8,
                maxWidth: "540px",
              }}
            >
              TDE brings the pieces of a trip together. Discover and compare
              transport, hotels and local experiences in one place, then choose
              what works best for you.
            </p>
          </div>
          <div
            style={{
              backgroundColor: "var(--ink)",
              padding: "2.5rem",
              minHeight: "220px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <p className="tag" style={{ color: "var(--orange)" }}>Travel, brought together</p>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "1.8rem",
                lineHeight: 1.2,
                color: "var(--cream)",
                maxWidth: "300px",
              }}
            >
              Less searching.
              <br />
              More going.
            </p>
          </div>
        </section>

        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem 5.5rem" }}>
          <div
            className="about-category-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "1px",
              backgroundColor: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {categories.map((category) => (
              <div key={category.title} style={{ backgroundColor: "var(--white)", padding: "2.25rem 2rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "1.1rem" }}>TDE / {category.title}</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "1.35rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.02em",
                    marginBottom: "0.7rem",
                  }}
                >
                  {category.title}
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.875rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.7,
                    minHeight: "4.5rem",
                    marginBottom: "1.4rem",
                  }}
                >
                  {category.body}
                </p>
                <Link
                  href={category.href}
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.75rem",
                    color: "var(--orange)",
                    textDecoration: "none",
                  }}
                >
                  {category.label} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section style={{ backgroundColor: "var(--white)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "5rem 2rem" }}>
            <div style={{ maxWidth: "560px", marginBottom: "2.5rem" }}>
              <p className="tag" style={{ marginBottom: "1.1rem" }}>A simpler way to plan</p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "clamp(1.8rem, 4vw, 2.7rem)",
                  color: "var(--ink)",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  marginBottom: "1rem",
                }}
              >
                From first search to next adventure.
              </h2>
              <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.75 }}>
                TDE keeps the planning experience clear, flexible and focused
                on the places you want to go.
              </p>
            </div>
            <div
              className="about-steps-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1px",
                backgroundColor: "var(--border)",
                border: "1px solid var(--border)",
              }}
            >
              {steps.map(([number, title, body]) => (
                <div key={number} style={{ backgroundColor: "var(--cream)", padding: "2rem" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.5rem", color: "var(--orange)", marginBottom: "1.25rem" }}>
                    {number}
                  </p>
                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.1rem", color: "var(--ink)", marginBottom: "0.6rem" }}>
                    {title}
                  </h3>
                  <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.825rem", color: "var(--ink-soft)", lineHeight: 1.7 }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "5rem 2rem 6rem", textAlign: "center" }}>
          <p className="tag" style={{ marginBottom: "1rem" }}>Ready when you are</p>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(1.8rem, 4vw, 2.6rem)", color: "var(--ink)", letterSpacing: "-0.03em", marginBottom: "1.5rem" }}>
            Start planning your next trip.
          </h2>
          <Link
            href="/home"
            style={{
              display: "inline-block",
              backgroundColor: "var(--ink)",
              color: "var(--cream)",
              fontFamily: "var(--font-body)",
              fontSize: "0.8rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              textDecoration: "none",
              padding: "0.9rem 1.5rem",
            }}
          >
            Explore TDE
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
