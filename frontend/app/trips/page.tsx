"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";

/* ─── Mock trips ──────────────────────────────────────────────── */
type TripStatus = "SAVED" | "COMPLETED" | "UPCOMING";

const trips: {
  id: string;
  title: string;
  status: TripStatus;
  route: string;
  dates: string;
  included: string;
  total: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
}[] = [
  {
    id: "hyd-weekend",
    title: "Hyderabad Weekend",
    status: "SAVED",
    route: "Visakhapatnam → Hyderabad",
    dates: "15 – 17 Sep",
    included: "Flight, hotel and 1 experience",
    total: "₹10,600",
    primaryCta: "Manage booking",
    primaryHref: "/itinerary",
    secondaryCta: "View trip",
    secondaryHref: "/booking/confirm",
  },
  {
    id: "goa-beach",
    title: "Goa Beach Trip",
    status: "COMPLETED",
    route: "Visakhapatnam → Goa",
    dates: "22 – 25 Oct",
    included: "Flight, hotel and 1 experience",
    total: "₹18,400",
    primaryCta: "View receipt",
    primaryHref: "/trips/goa-beach/receipt",
    secondaryCta: "View trip",
    secondaryHref: "/trips/goa-beach",
  },
  {
    id: "mumbai-business",
    title: "Mumbai Business",
    status: "UPCOMING",
    route: "Visakhapatnam → Mumbai",
    dates: "5 – 6 Nov",
    included: "Flight and hotel",
    total: "₹12,200",
    primaryCta: "Manage booking",
    primaryHref: "/trips/mumbai-business/manage",
    secondaryCta: "View trip",
    secondaryHref: "/trips/mumbai-business",
  },
];

/* ─── Sidebar nav ─────────────────────────────────────────────── */
const sidebarNav = [
  { label: "My trips", href: "/trips" },
  { label: "Saved settings", href: "/trips/settings" },
  { label: "Preferences", href: "/trips/preferences" },
  { label: "Travel history", href: "/trips/history" },
  { label: "Help & support", href: "/help" },
];

/* ─── Status badge colours ────────────────────────────────────── */
const statusStyle: Record<TripStatus, { color: string; bg: string; border: string }> = {
  SAVED:      { color: "var(--ink)",    bg: "var(--cream-dark)", border: "var(--border)" },
  COMPLETED:  { color: "var(--white)",  bg: "var(--ink)",        border: "var(--ink)" },
  UPCOMING:   { color: "var(--orange)", bg: "transparent",       border: "var(--orange)" },
};

export default function TripsPage() {
  const pathname = usePathname();
  const { user } = useAuth();
  const profile = {
    initials: user?.initials || "GU",
    name: user?.name || "Guest traveler",
    email: user?.email || "Sign in to save your trips",
    memberSince: user ? String(new Date().getFullYear()) : "—",
    tripsCompleted: trips.filter((trip) => trip.status === "COMPLETED").length,
  };

  return (
    <>
      <Navbar />
      <main style={{ flex: 1, backgroundColor: "var(--cream)" }}>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "3.5rem 2rem 5rem",
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: "3rem",
            alignItems: "start",
          }}
        >
          {/* ── Left: sidebar ─────────────────────────────────── */}
          <aside>
            {/* Avatar block */}
            <div
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--white)",
                padding: "1.5rem",
                marginBottom: "1px",
              }}
            >
              {/* Initials circle */}
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  backgroundColor: "var(--ink)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "0.875rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    color: "var(--white)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {profile.initials}
                </span>
              </div>

              {/* Name + email */}
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: "var(--ink)",
                  marginBottom: "0.15rem",
                }}
              >
                {profile.name}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.775rem",
                  color: "var(--ink-muted)",
                  marginBottom: "0.875rem",
                }}
              >
                {profile.email}
              </p>

              {/* Divider */}
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border)",
                  marginBottom: "0.875rem",
                }}
              />

              {/* Meta */}
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.72rem",
                  color: "var(--ink-muted)",
                  lineHeight: 1.6,
                }}
              >
                Member since {profile.memberSince} · {profile.tripsCompleted} trips
                completed
              </p>
            </div>

            {/* Nav links */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderTop: "none",
                backgroundColor: "var(--white)",
                overflow: "hidden",
              }}
            >
                {sidebarNav.map((item, i) => {
                  const isActive = pathname === item.href;
                  return (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{
                    display: "block",
                    padding: "0.875rem 1.5rem",
                    fontFamily: "var(--font-body)",
                    fontWeight: isActive ? 500 : 300,
                    fontSize: "0.85rem",
                    color: isActive ? "var(--white)" : "var(--ink-soft)",
                    backgroundColor: isActive ? "var(--ink)" : "transparent",
                    textDecoration: "none",
                    borderTop: i > 0 ? "1px solid var(--border)" : "none",
                    transition: "background-color 0.15s",
                  }}
                >
                  {item.label}
                </Link>
                  );
                })}
            </div>
          </aside>

          {/* ── Right: trips list ─────────────────────────────── */}
          <div>
            {/* Header row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "1.75rem",
              }}
            >
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "1.75rem",
                  color: "var(--ink)",
                  letterSpacing: "-0.025em",
                }}
              >
                My trips
              </h1>
              <Link
                href="/"
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  letterSpacing: "0.04em",
                  color: "var(--white)",
                  backgroundColor: "var(--ink)",
                  padding: "0.6rem 1.25rem",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  transition: "background-color 0.15s",
                }}
              >
                Plan a new trip
              </Link>
            </div>

            {/* Trip cards */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1px",
                backgroundColor: "var(--border)",
                border: "1px solid var(--border)",
              }}
            >
              {trips.map((trip) => {
                const badge = statusStyle[trip.status];
                return (
                  <div
                    key={trip.id}
                    style={{
                      backgroundColor: "var(--white)",
                      padding: "1.5rem 1.75rem",
                    }}
                  >
                    {/* Title row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "1rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <h2
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 600,
                            fontSize: "1.1rem",
                            color: "var(--ink)",
                            letterSpacing: "-0.015em",
                          }}
                        >
                          {trip.title}
                        </h2>
                        {/* Status badge */}
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.58rem",
                            fontWeight: 500,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: badge.color,
                            backgroundColor: badge.bg,
                            border: `1px solid ${badge.border}`,
                            padding: "0.2rem 0.6rem",
                          }}
                        >
                          {trip.status}
                        </span>
                      </div>

                      {/* Total */}
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                          color: "var(--ink)",
                          letterSpacing: "-0.01em",
                          flexShrink: 0,
                          marginLeft: "1rem",
                        }}
                      >
                        {trip.total}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "1rem",
                        marginBottom: "1.25rem",
                        paddingBottom: "1.25rem",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div>
                        <p
                          className="tag-neutral"
                          style={{ marginBottom: "0.2rem", fontSize: "0.58rem" }}
                        >
                          Route
                        </p>
                        <p
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.825rem",
                            color: "var(--ink)",
                          }}
                        >
                          {trip.route}
                        </p>
                      </div>
                      <div>
                        <p
                          className="tag-neutral"
                          style={{ marginBottom: "0.2rem", fontSize: "0.58rem" }}
                        >
                          Dates
                        </p>
                        <p
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.825rem",
                            color: "var(--ink)",
                          }}
                        >
                          {trip.dates}
                        </p>
                      </div>
                      <div>
                        <p
                          className="tag-neutral"
                          style={{ marginBottom: "0.2rem", fontSize: "0.58rem" }}
                        >
                          Included
                        </p>
                        <p
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.825rem",
                            color: "var(--ink)",
                          }}
                        >
                          {trip.included}
                        </p>
                      </div>
                    </div>

                    {/* CTA row */}
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <Link
                        href={trip.primaryHref}
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 400,
                          fontSize: "0.8rem",
                          letterSpacing: "0.02em",
                          color: "var(--ink)",
                          backgroundColor: "transparent",
                          border: "1px solid var(--border)",
                          padding: "0.55rem 1.1rem",
                          textDecoration: "none",
                          transition: "border-color 0.15s",
                        }}
                      >
                        {trip.primaryCta}
                      </Link>
                      <Link
                        href={trip.secondaryHref}
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 500,
                          fontSize: "0.8rem",
                          letterSpacing: "0.02em",
                          color: "var(--white)",
                          backgroundColor: "var(--ink)",
                          border: "1px solid var(--ink)",
                          padding: "0.55rem 1.1rem",
                          textDecoration: "none",
                          transition: "background-color 0.15s",
                        }}
                      >
                        {trip.secondaryCta}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
