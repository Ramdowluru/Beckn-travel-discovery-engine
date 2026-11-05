import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface ContentSection {
  heading: string;
  body: string;
}

interface ContentPageProps {
  eyebrow: string;
  title: string;
  description: string;
  sections: ContentSection[];
  actions?: { label: string; href: string; primary?: boolean }[];
}

export default function ContentPage({
  eyebrow,
  title,
  description,
  sections,
  actions = [],
}: ContentPageProps) {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem 6rem" }}>
          <p className="tag" style={{ marginBottom: "1rem" }}>{eyebrow}</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(2.25rem, 5vw, 3.75rem)", color: "var(--ink)", lineHeight: 1.05, letterSpacing: "-0.03em", maxWidth: "700px", marginBottom: "1.25rem" }}>
            {title}
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "1rem", color: "var(--ink-soft)", lineHeight: 1.75, maxWidth: "620px", marginBottom: "3rem" }}>
            {description}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "var(--border)", border: "1px solid var(--border)" }}>
            {sections.map((section) => (
              <section key={section.heading} style={{ backgroundColor: "var(--white)", padding: "1.75rem 2rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.2rem", color: "var(--ink)", marginBottom: "0.65rem" }}>
                  {section.heading}
                </h2>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.75 }}>
                  {section.body}
                </p>
              </section>
            ))}
          </div>

          {actions.length > 0 && (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "2rem" }}>
              {actions.map((action) => (
                <Link key={action.href} href={action.href} style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.8rem", letterSpacing: "0.04em", color: action.primary ? "var(--white)" : "var(--ink)", backgroundColor: action.primary ? "var(--ink)" : "transparent", border: `1px solid ${action.primary ? "var(--ink)" : "var(--border)"}`, padding: "0.7rem 1.2rem", textDecoration: "none" }}>
                  {action.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}