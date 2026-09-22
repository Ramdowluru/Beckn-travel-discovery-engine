"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

/* ─── Nav link definitions ────────────────────────────────────── */
const navLinks = [
  { href: "/",         label: "Explore" },
  { href: "/trips",    label: "Trips"   },
  { href: "/partners", label: "Our Partners" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about",    label: "About"   },
];

/* ─── Which nav entry should be active for a given pathname ───── */
function getActiveHref(pathname: string): string {
  /* Explore — landing + all results + auth flows */
  if (
    pathname === "/" ||
    pathname.startsWith("/results") ||
    pathname.startsWith("/auth")
  ) return "/";

  /* Trips — profile, itinerary, booking */
  if (
    pathname.startsWith("/trips") ||
    pathname.startsWith("/itinerary") ||
    pathname.startsWith("/booking")
  ) return "/trips";

  /* Partners */
  if (pathname.startsWith("/partners")) return "/partners";

  /* How it works */
  if (pathname.startsWith("/how-it-works")) return "/how-it-works";

  /* About */
  if (pathname.startsWith("/about")) return "/about";

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
  const { user, signOut } = useAuth();
  const activeHref = getActiveHref(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSignOut() {
    signOut();
    router.push("/");
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
        <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
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
            <div>
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
          <Link
            href="/how-it-works"
            className="tag-neutral navbar-system-tag"
            style={{ color: "rgba(242,237,228,0.35)", fontSize: "0.6rem" }}
            title="View how TDE works"
          >
            [SYS-OPS]
          </Link>

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

          {user ? (
            /* ── Authenticated ─────────────────────────────── */
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {/* Avatar */}
              <Link
                href="/trips"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  textDecoration: "none",
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
              </Link>

              {/* Sign out */}
              <button
                onClick={handleSignOut}
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 400,
                  fontSize: "0.75rem",
                  color: "rgba(242,237,228,0.45)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  letterSpacing: "0.02em",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "rgba(242,237,228,0.9)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color =
                    "rgba(242,237,228,0.45)")
                }
              >
                Sign out
              </button>
            </div>
          ) : (
            /* ── Unauthenticated ───────────────────────────── */
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
          </div>
        )}
      </div>
    </nav>
  );
}
