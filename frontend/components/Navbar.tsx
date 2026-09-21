"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Explore" },
  { href: "/trips", label: "Trips" },
  { href: "/partners", label: "Our Partners" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        backgroundColor: "var(--forest)",
        borderBottom: "1px solid var(--border-dark)",
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
      >
        {/* Logo */}
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

        {/* Nav links */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2rem",
            flex: 1,
          }}
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
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
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexShrink: 0 }}>
          <span
            className="tag-neutral"
            style={{ color: "rgba(242,237,228,0.35)", fontSize: "0.6rem" }}
          >
            [SYS-OPS]
          </span>
          <Link
            href="/auth/signin"
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
      </div>
    </nav>
  );
}
