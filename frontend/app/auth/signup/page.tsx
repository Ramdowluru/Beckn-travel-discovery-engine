import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SignUpForm from "./SignUpForm";

export default function SignUpPage() {
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
          <div style={{ marginBottom: "2.5rem" }}>
            <p className="tag" style={{ marginBottom: "0.75rem" }}>
              Get started
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
              Create account
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
              Save trips, track bookings and build journeys across providers.
            </p>
          </div>

          <SignUpForm />

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
            Already have an account?{" "}
            <Link
              href="/auth/signin"
              style={{ color: "var(--orange)", fontWeight: 500, textDecoration: "none" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
