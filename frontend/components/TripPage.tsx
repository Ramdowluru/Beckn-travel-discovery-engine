import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface TripPageProps {
  title: string;
  status: string;
  route: string;
  dates: string;
  included: string;
  total: string;
  description: string;
  actions: { label: string; href: string; primary?: boolean }[];
}

export default function TripPage({ title, status, route, dates, included, total, description, actions }: TripPageProps) {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "5rem 2rem 6rem" }}>
          <p className="tag" style={{ marginBottom: "1rem" }}>Saved trip</p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(2rem, 4vw, 3rem)", color: "var(--ink)", letterSpacing: "-0.03em" }}>{title}</h1>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.1em", color: "var(--orange)", border: "1px solid var(--orange)", padding: "0.3rem 0.65rem" }}>{status}</span>
          </div>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.95rem", color: "var(--ink-soft)", lineHeight: 1.7, marginBottom: "2.5rem", maxWidth: "620px" }}>{description}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1px", backgroundColor: "var(--border)", border: "1px solid var(--border)", marginBottom: "2rem" }}>
            {[{ label: "Route", value: route }, { label: "Dates", value: dates }, { label: "Included", value: included }, { label: "Total", value: total }].map((item) => (
              <div key={item.label} style={{ backgroundColor: "var(--white)", padding: "1.25rem 1.5rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.35rem" }}>{item.label}</p>
                <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", color: "var(--ink)" }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {actions.map((action) => (
              <Link key={action.href} href={action.href} style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.8rem", letterSpacing: "0.04em", color: action.primary ? "var(--white)" : "var(--ink)", backgroundColor: action.primary ? "var(--ink)" : "transparent", border: `1px solid ${action.primary ? "var(--ink)" : "var(--border)"}`, padding: "0.7rem 1.2rem", textDecoration: "none" }}>
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}