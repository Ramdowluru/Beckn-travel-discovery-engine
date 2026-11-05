"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

/* ─── Nav link definitions ────────────────────────────────────── */
const navLinks = [
  { href: "/home",     label: "Explore" },
  { href: "/bookings", label: "My Bookings" },
  { href: "/trips",    label: "Trips"   },
];

/* ─── Which nav entry should be active for a given pathname ───── */
function getActiveHref(pathname: string): string {
  /* Explore — landing + all results + auth flows */
  if (
    pathname === "/home" ||
    pathname.startsWith("/results") ||
    pathname.startsWith("/auth")
  ) return "/home";

  /* Trips — profile, itinerary, booking */
  if (
    pathname.startsWith("/trips") ||
    pathname.startsWith("/itinerary") ||
    pathname.startsWith("/booking")
  ) return "/trips";

  /* Bookings */
  if (pathname.startsWith("/bookings")) return "/bookings";

  return "";
}

/* ─── Derive initials from a full name ───────────────────────── */
function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/* ─── Component ───────────────────────────────────────────────── */
export default function Navbar() {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user, loading, error: authError, signOut } = useAuth();
  const activeHref = getActiveHref(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  async function handleSignOut() {
    try {
      await signOut();
      router.push("/auth/signin");
    } catch {
      window.alert("We couldn’t sign out. Please try again.");
    }
  }

  return (
    <nav
      style={{
        backgroundColor: "var(--forest)",
        borderBottom: "1px solid var(--border-dark)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0 2rem",
          display: "flex",
          alignItems: "center",
          height: "56px",
          gap: "3rem",
        }}
        className="navbar-inner"
      >
        {/* ── Logo ──────────────────────────────────────────── */}
        <Link href="/home" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                backgroundColor: "var(--cream)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: "0.875rem",
                  color: "var(--ink)",
                  letterSpacing: "-0.02em",
                }}
              >
                TDE
              </span>
            </div>
            <div className="navbar-brand-copy">
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--cream)",
                  lineHeight: 1.2,
                }}
              >
                Travel Discovery Engine
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.65rem",
                  color: "rgba(242,237,228,0.5)",
                  letterSpacing: "0.04em",
                }}
              >
                Flights · hotels · experiences
              </div>
            </div>
          </div>
        </Link>

        {/* ── Nav links ─────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2rem",
            flex: 1,
          }}
          className="desktop-nav-links"
        >
          {navLinks.map((link) => {
            const isActive = activeHref === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 400,
                  fontSize: "0.875rem",
                  color: isActive ? "var(--orange)" : "rgba(242,237,228,0.75)",
                  textDecoration: "none",
                  paddingBottom: "2px",
                  borderBottom: isActive
                    ? "1px solid var(--orange)"
                    : "1px solid transparent",
                  transition: "color 0.15s, border-color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* ── Right side ────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
            flexShrink: 0,
          }}
          className="navbar-actions"
        >
          <button
            type="button"
            className="mobile-menu-button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>

          {loading ? (
            <span style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "rgba(242,237,228,0.65)" }}>
              Checking session…
            </span>
          ) : user ? (
            /* ── Authenticated ─────────────────────────────── */
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {/* Account menu */}
              <div className="account-menu" style={{ position: "relative" }}>
                <button
                  type="button"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((open) => !open)}
                  style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  textDecoration: "none",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  }}
                >
                  <div
                    style={{
                    width: "30px",
                    height: "30px",
                    backgroundColor: "var(--orange)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: "0.65rem",
                      color: "var(--white)",
                      letterSpacing: "0.04em",
                      }}
                    >
                      {initials(user.name)}
                    </span>
                  </div>
                  <span
                    style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    color: "var(--cream)",
                    letterSpacing: "0.01em",
                    }}
                  >
                    {user.name.split(" ")[0]}
                  </span>
                </button>
                {accountOpen && (
                  <div className="account-menu-popover">
                    <span>{user.email}</span>
                    <button type="button" onClick={handleSignOut}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Unauthenticated ───────────────────────────── */
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {authError && (
              <span role="status" style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", color: "var(--orange)" }}>
                Session unavailable
              </span>
            )}
            <Link
              href="/auth/signin"
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: "0.8rem",
                color: "var(--ink)",
                backgroundColor: "var(--cream)",
                padding: "0.5rem 1.25rem",
                textDecoration: "none",
                letterSpacing: "0.02em",
                border: "1px solid var(--cream)",
                transition: "background-color 0.15s",
              }}
            >
              Sign in
            </Link>
            </div>
          )}
        </div>

        {menuOpen && (
          <div className="mobile-nav-drawer">
            {navLinks.map((link) => {
              const isActive = activeHref === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  style={{ color: isActive ? "var(--orange)" : "var(--cream)" }}
                >
                  {link.label}
                </Link>
              );
            })}
            {user && (
              <>
                <span style={{ color: "rgba(242,237,228,0.55)", fontSize: "0.8rem", paddingTop: "0.75rem" }}>{user.email}</span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{ textAlign: "left", background: "none", border: "none", color: "var(--cream)", padding: "0.85rem 0", fontFamily: "var(--font-body)", fontSize: "0.9rem" }}
                >
                  Sign out
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
