import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "7rem 2rem 9rem" }}>
          <p className="tag" style={{ marginBottom: "1rem" }}>404 / Not found</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(2.5rem, 7vw, 5rem)", color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.04em", marginBottom: "1.25rem" }}>This route took a wrong turn.</h1>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "1rem", color: "var(--ink-soft)", lineHeight: 1.7, maxWidth: "520px", marginBottom: "2rem" }}>The page you requested does not exist or may have moved.</p>
          <Link href="/" style={{ display: "inline-block", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.8rem", letterSpacing: "0.04em", color: "var(--white)", backgroundColor: "var(--ink)", padding: "0.75rem 1.25rem", textDecoration: "none" }}>Return home</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}