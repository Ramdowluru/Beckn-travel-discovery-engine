import Link from "next/link";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  activePage: "signin" | "signup";
  children: ReactNode;
};

export default function AuthLayout({ activePage, children }: AuthLayoutProps) {
  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Link href="/home" className="auth-brand" aria-label="TDE home">
          <span className="auth-brand-mark">TDE</span>
          <span>
            <strong>Travel Discovery Engine</strong>
            <small>Flights · Hotels · Experiences</small>
          </span>
        </Link>
        <p className="auth-header-note">One account. Every journey.</p>
      </header>

      <div className="auth-content">
        <section className="auth-intro" aria-labelledby="auth-intro-title">
          <p className="tag">Welcome to TDE</p>
          <h1 id="auth-intro-title">
            One search.
            <br />
            Every way to go.
          </h1>
          <p className="auth-intro-copy">
            Compare flights, trains, buses, hotels and local experiences
            across India — then book directly with the provider.
          </p>
          <div className="auth-benefits" aria-label="TDE travel categories">
            <span><b aria-hidden="true">✈</b>Flights<br />&amp; Trains</span>
            <span><b aria-hidden="true">⌂</b>Hotels<br />&amp; Stays</span>
            <span><b aria-hidden="true">✦</b>Local<br />Experiences</span>
            <span><b aria-hidden="true">⌖</b>All in<br />One Place</span>
          </div>
          <div className="auth-travel-images" aria-hidden="true">
            <div className="auth-travel-image auth-travel-image-train" />
            <div className="auth-travel-image auth-travel-image-beach" />
            <div className="auth-travel-image auth-travel-image-city" />
          </div>
        </section>

        <section className="auth-card" aria-label={activePage === "signin" ? "Sign in" : "Create account"}>
          <nav className="auth-tabs" aria-label="Authentication">
            <Link className={activePage === "signin" ? "is-active" : ""} href="/auth/signin">Sign in</Link>
            <Link className={activePage === "signup" ? "is-active" : ""} href="/auth/signup">Create account</Link>
          </nav>
          <div className="auth-card-heading">
            <h2>{activePage === "signin" ? "Welcome back" : "Start your journey"}</h2>
            <p>{activePage === "signin" ? "Sign in to continue your journey" : "Create an account to save your journeys"}</p>
          </div>
          {children}
        </section>
      </div>

      <footer className="auth-footer">
        <span>© 2026 TDE. All bookings made directly with providers.</span>
        <span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/help">Help</Link></span>
      </footer>
    </main>
  );
}
