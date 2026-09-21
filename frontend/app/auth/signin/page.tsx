import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SignInForm from "./SignInForm";

export default function SignInPage() {
  return (
    <>
      <Navbar />
      <main
        style={{
          flex: 1,
          backgroundColor: "var(--cream)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "5rem 2rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "420px" }}>

          {/* ── Header ──────────────────────────────────────────── */}
          <div style={{ marginBottom: "2.5rem" }}>
            <p className="tag" style={{ marginBottom: "0.75rem" }}>
              Welcome back
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "2rem",
                color: "var(--ink)",
                letterSpacing: "-0.03em",
                marginBottom: "0.5rem",
              }}
            >
              Sign in
            </h1>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.875rem",
                color: "var(--ink-soft)",
                lineHeight: 1.6,
              }}
            >
              Access your saved trips, bookings and journey history.
            </p>
          </div>

          {/* ── Form (client component) ─────────────────────────── */}
          <SignInForm />

          {/* ── Sign up link ─────────────────────────────────────── */}
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "0.825rem",
              color: "var(--ink-muted)",
              textAlign: "center",
              marginTop: "2rem",
            }}
          >
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              style={{
                color: "var(--orange)",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
