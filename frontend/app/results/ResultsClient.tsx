"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  transportOptions,
  stayOptions,
  experienceOptions,
} from "@/lib/mockData";

const tabs = [
  { key: "travel", label: "Travel", count: "18 options", from: "from ₹950" },
  { key: "stays", label: "Stays", count: "42 options", from: "from ₹2,200/night" },
  { key: "experiences", label: "Experiences", count: "18 options", from: "from ₹500" },
];

const departureFilters = ["Morning", "Afternoon", "Evening"];
const typeFilters = ["Flight", "Train", "Bus"];
const stayFilterPills = ["Rating 4+", "Price: low to high", "Free cancellation"];
const experienceCategories = ["Food", "Culture", "Adventure", "History", "Nature", "Local"];

export default function ResultsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab   = searchParams.get("tab")        ?? "travel";
  const fromCity    = searchParams.get("from")       ?? "Visakhapatnam";
  const toCity      = searchParams.get("to")         ?? "Hyderabad";
  const dateRaw     = searchParams.get("date")       ?? "";
  const travellers  = searchParams.get("travellers") ?? "1";
  const [activeCategory, setActiveCategory] = useState("Food");

  function formatDate(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  const dateDisplay = formatDate(dateRaw);

  function switchTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/results?${params.toString()}`);
  }

  return (
    <>
      {/* ── Context bar ───────────────────────────────────────── */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--white)",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem",
            height: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: "0.85rem",
                color: "var(--ink)",
              }}
            >
              {fromCity} → {toCity}
            </span>
            <span
              style={{
                width: "1px",
                height: "16px",
                backgroundColor: "var(--border)",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.825rem",
                color: "var(--ink-soft)",
              }}
            >
              {dateDisplay || "Any date"}
            </span>
            <span
              style={{
                width: "1px",
                height: "16px",
                backgroundColor: "var(--border)",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.825rem",
                color: "var(--ink-soft)",
              }}
            >
              {travellers} {travellers === "1" ? "traveller" : "travellers"}
            </span>
          </div>
          <Link
            href={`/?from=${encodeURIComponent(fromCity)}&to=${encodeURIComponent(toCity)}&date=${dateRaw}&travellers=${travellers}`}
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 500,
              fontSize: "0.8rem",
              color: "var(--orange)",
              textDecoration: "none",
            }}
          >
            Edit search
          </Link>
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--white)",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 2rem",
            display: "flex",
            gap: 0,
          }}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => switchTab(tab.key)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: isActive
                    ? "2px solid var(--orange)"
                    : "2px solid transparent",
                  padding: "1rem 2rem 0.875rem",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s",
                  marginBottom: "-1px",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: "0.875rem",
                    color: isActive ? "var(--orange)" : "var(--ink-soft)",
                    marginBottom: "0.15rem",
                    letterSpacing: "0.01em",
                  }}
                >
                  {tab.label}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.75rem",
                    color: "var(--ink-muted)",
                  }}
                >
                  {tab.count}, {tab.from}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "2rem 2rem 4rem",
          display: "grid",
          gridTemplateColumns: activeTab === "experiences" ? "1fr" : "1fr 280px",
          gap: "2rem",
          alignItems: "start",
        }}
      >
        {/* ── Left: results ─────────────────────────────────── */}
        <div>
          {activeTab === "travel" && (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "1.25rem",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "1.4rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Available transport
                </h2>
                <span
                  className="tag-neutral"
                  style={{ fontSize: "0.65rem" }}
                >
                  {transportOptions.length} options
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1px", backgroundColor: "var(--border)" }}>
                {transportOptions.map((opt) => (
                  <div
                    key={opt.id}
                    style={{
                      backgroundColor: "var(--white)",
                      padding: "1.25rem 1.5rem",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: "1.5rem",
                    }}
                  >
                    {/* Left */}
                    <div>
                      {/* Provider + type */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.6rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 600,
                            fontSize: "0.9rem",
                            color: "var(--ink)",
                          }}
                        >
                          {opt.provider}
                        </span>
                        <span
                          className="tag-neutral"
                          style={{ fontSize: "0.6rem" }}
                        >
                          {opt.type}
                        </span>
                      </div>

                      {/* Route row */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontFamily: "var(--font-display)",
                              fontWeight: 700,
                              fontSize: "1.1rem",
                              color: "var(--ink)",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {opt.departure}
                          </p>
                          <p
                            style={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 300,
                              fontSize: "0.725rem",
                              color: "var(--ink-muted)",
                            }}
                          >
                            {opt.departureCity}
                          </p>
                        </div>

                        {/* Duration line */}
                        <div
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "0.2rem",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.7rem",
                              color: "var(--ink-muted)",
                              fontWeight: 400,
                            }}
                          >
                            {opt.duration} · {opt.stops}
                          </span>
                          <div
                            style={{
                              width: "100%",
                              height: "1px",
                              backgroundColor: "var(--border)",
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: "-3px",
                                width: "6px",
                                height: "6px",
                                backgroundColor: "var(--ink-soft)",
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <p
                            style={{
                              fontFamily: "var(--font-display)",
                              fontWeight: 700,
                              fontSize: "1.1rem",
                              color: "var(--ink)",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {opt.arrival}
                          </p>
                          <p
                            style={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 300,
                              fontSize: "0.725rem",
                              color: "var(--ink-muted)",
                            }}
                          >
                            {opt.arrivalCity}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Right: price + CTA */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: "0.75rem",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          fontSize: "1.2rem",
                          color: "var(--ink)",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {opt.price}
                      </span>
                      <Link
                        href={`/results/transport/${opt.id}`}
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 500,
                          fontSize: "0.775rem",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--white)",
                          backgroundColor: "var(--ink)",
                          padding: "0.55rem 1.25rem",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                          transition: "background-color 0.15s",
                        }}
                      >
                        Choose
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "stays" && (
            <>
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "1rem",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "1.4rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  42 stays in {toCity}
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.8rem",
                    color: "var(--ink-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Handpicked hotels and homes
                </span>
              </div>

              {/* Filter pills */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginBottom: "1.75rem",
                  flexWrap: "wrap",
                }}
              >
                {stayFilterPills.map((pill, i) => (
                  <button
                    key={pill}
                    style={{
                      fontFamily: "var(--font-body)",
                      fontWeight: 400,
                      fontSize: "0.775rem",
                      padding: "0.4rem 1rem",
                      border: "1px solid var(--border)",
                      backgroundColor: i === 0 ? "var(--ink)" : "transparent",
                      color: i === 0 ? "var(--white)" : "var(--ink-soft)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {pill}
                  </button>
                ))}
              </div>

              {/* Cards grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "1px",
                  backgroundColor: "var(--border)",
                  border: "1px solid var(--border)",
                }}
              >
                {stayOptions.map((stay) => (
                  <div
                    key={stay.id}
                    style={{ backgroundColor: "var(--white)" }}
                  >
                    {/* Image */}
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "4/3",
                        overflow: "hidden",
                        backgroundColor: "var(--cream-dark)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={stay.image}
                        alt={stay.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                          transition: "transform 0.3s ease",
                        }}
                      />
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "1rem 1.1rem 1.25rem" }}>
                      {/* Provider + rating */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.3rem",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 300,
                            fontSize: "0.7rem",
                            color: "var(--ink-muted)",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {stay.provider}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            color: "var(--orange)",
                            fontWeight: 500,
                          }}
                        >
                          ★ {stay.rating}
                        </span>
                      </div>

                      {/* Hotel name */}
                      <p
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 600,
                          fontSize: "1rem",
                          color: "var(--ink)",
                          letterSpacing: "-0.01em",
                          marginBottom: "0.2rem",
                        }}
                      >
                        {stay.name}
                      </p>

                      {/* Location */}
                      <p
                        style={{
                          fontFamily: "var(--font-body)",
                          fontWeight: 300,
                          fontSize: "0.75rem",
                          color: "var(--ink-muted)",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {stay.location}
                      </p>

                      {/* Amenity chips */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.35rem",
                          marginBottom: "1rem",
                        }}
                      >
                        {stay.amenities.map((a) => (
                          <span
                            key={a}
                            style={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 400,
                              fontSize: "0.68rem",
                              color: "var(--ink-soft)",
                              backgroundColor: "var(--cream)",
                              border: "1px solid var(--border)",
                              padding: "0.15rem 0.5rem",
                              letterSpacing: "0.01em",
                            }}
                          >
                            {a}
                          </span>
                        ))}
                      </div>

                      {/* Price + CTA */}
                      <div
                        style={{
                          borderTop: "1px solid var(--border)",
                          paddingTop: "0.875rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-end",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontFamily: "var(--font-display)",
                              fontWeight: 700,
                              fontSize: "1.05rem",
                              color: "var(--ink)",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {stay.pricePerNight}
                            <span
                              style={{
                                fontFamily: "var(--font-body)",
                                fontWeight: 300,
                                fontSize: "0.72rem",
                                color: "var(--ink-muted)",
                                marginLeft: "0.25rem",
                              }}
                            >
                              / night
                            </span>
                          </p>
                          <p
                            style={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 300,
                              fontSize: "0.7rem",
                              color: "var(--ink-muted)",
                            }}
                          >
                            {stay.totalPrice} total · {stay.nights} nights
                          </p>
                        </div>
                        <Link
                          href={`/results/stays/${stay.id}`}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 500,
                            fontSize: "0.75rem",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--white)",
                            backgroundColor: "var(--ink)",
                            padding: "0.5rem 1rem",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          View stay
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "experiences" && (
            <>
              {/* Context sub-bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "1rem",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 600,
                    fontSize: "1.4rem",
                    color: "var(--ink)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Experience the city
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 300,
                    fontSize: "0.8rem",
                    color: "var(--ink-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Hosted by local guides
                </span>
              </div>

              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  fontSize: "0.825rem",
                  color: "var(--ink-soft)",
                  marginBottom: "1.5rem",
                }}
              >
                Guided tours and hands-on activities led by people who live here.
              </p>

              {/* Category filter pills */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginBottom: "2rem",
                }}
              >
                {experienceCategories.map((cat) => {
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: isActive ? 500 : 300,
                        fontSize: "0.8rem",
                        padding: "0.45rem 1.1rem",
                        border: "1px solid var(--border)",
                        backgroundColor: isActive ? "var(--ink)" : "transparent",
                        color: isActive ? "var(--white)" : "var(--ink-soft)",
                        cursor: "pointer",
                        letterSpacing: "0.02em",
                        transition: "all 0.15s",
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* 2×2 experience grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "1px",
                  backgroundColor: "var(--border)",
                  border: "1px solid var(--border)",
                }}
              >
                {experienceOptions.map((exp) => (
                  <div
                    key={exp.id}
                    style={{
                      backgroundColor: "var(--white)",
                      display: "grid",
                      gridTemplateColumns: "200px 1fr",
                    }}
                  >
                    {/* Image */}
                    <div
                      style={{
                        overflow: "hidden",
                        backgroundColor: "var(--cream-dark)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={exp.image}
                        alt={exp.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div
                      style={{
                        padding: "1.25rem 1.25rem 1.25rem 1.25rem",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        {/* Provider + rating */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.35rem",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 300,
                              fontSize: "0.7rem",
                              color: "var(--ink-muted)",
                            }}
                          >
                            Hosted by {exp.provider}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.72rem",
                              color: "var(--orange)",
                              fontWeight: 500,
                            }}
                          >
                            ★ {exp.rating}
                          </span>
                        </div>

                        {/* Name */}
                        <p
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 600,
                            fontSize: "1rem",
                            color: "var(--ink)",
                            letterSpacing: "-0.01em",
                            marginBottom: "0.25rem",
                            lineHeight: 1.2,
                          }}
                        >
                          {exp.name}
                        </p>

                        {/* Duration */}
                        <p
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 300,
                            fontSize: "0.75rem",
                            color: "var(--ink-muted)",
                            marginBottom: "1rem",
                          }}
                        >
                          Duration: {exp.duration}
                        </p>
                      </div>

                      {/* Price + CTA */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontWeight: 700,
                            fontSize: "1.1rem",
                            color: "var(--ink)",
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {exp.price}
                        </span>
                        <Link
                          href={`/results/experiences/${exp.id}`}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 500,
                            fontSize: "0.75rem",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: "var(--white)",
                            backgroundColor: "var(--ink)",
                            padding: "0.5rem 1rem",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                          }}
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Right: filter / info panel ────────────────────── */}
        {(activeTab === "travel" || activeTab === "stays") && (
          <aside>
            <div
              style={{
                border: "1px solid var(--border)",
                backgroundColor: "var(--white)",
                padding: "1.5rem",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "var(--ink)",
                  letterSpacing: "0.02em",
                  marginBottom: "1.5rem",
                }}
              >
                Filter results
              </h3>

              {/* Price range */}
              <div style={{ marginBottom: "1.5rem" }}>
                <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>
                  Price
                </p>
                <div
                  style={{
                    height: "2px",
                    backgroundColor: "var(--border)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: "60%",
                      height: "2px",
                      backgroundColor: "var(--orange)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "58%",
                      top: "-4px",
                      width: "10px",
                      height: "10px",
                      backgroundColor: "var(--orange)",
                      cursor: "pointer",
                    }}
                  />
                </div>
              </div>

              {/* Travel-specific filters */}
              {activeTab === "travel" && (
                <>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>
                      Departure time
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {departureFilters.map((f, i) => (
                        <button
                          key={f}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.775rem",
                            padding: "0.4rem 0.875rem",
                            border: "1px solid var(--border)",
                            backgroundColor: i === 0 ? "var(--ink)" : "transparent",
                            color: i === 0 ? "var(--white)" : "var(--ink-soft)",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: "1.75rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>
                      Type
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {typeFilters.map((f, i) => (
                        <button
                          key={f}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.775rem",
                            padding: "0.4rem 0.875rem",
                            border: "1px solid var(--border)",
                            backgroundColor: i === 0 ? "var(--ink)" : "transparent",
                            color: i === 0 ? "var(--white)" : "var(--ink-soft)",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Stays-specific filters */}
              {activeTab === "stays" && (
                <>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>
                      Rating
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {["3+", "4+", "4.5+"].map((f, i) => (
                        <button
                          key={f}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontWeight: 400,
                            fontSize: "0.775rem",
                            padding: "0.4rem 0.875rem",
                            border: "1px solid var(--border)",
                            backgroundColor: i === 1 ? "var(--ink)" : "transparent",
                            color: i === 1 ? "var(--white)" : "var(--ink-soft)",
                            cursor: "pointer",
                          }}
                        >
                          ★ {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: "1.75rem" }}>
                    <p className="tag-neutral" style={{ marginBottom: "0.75rem" }}>
                      Amenities
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {["WiFi", "AC", "Free cancellation", "Parking", "Restaurant"].map((a) => (
                        <label
                          key={a}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              width: "14px",
                              height: "14px",
                              border: "1px solid var(--border)",
                              backgroundColor: "transparent",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontFamily: "var(--font-body)",
                              fontWeight: 300,
                              fontSize: "0.8rem",
                              color: "var(--ink-soft)",
                            }}
                          >
                            {a}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Trust note */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: "1.25rem",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 400,
                    fontSize: "0.775rem",
                    color: "var(--ink-soft)",
                    lineHeight: 1.6,
                  }}
                >
                  <strong style={{ color: "var(--ink)" }}>
                    Book direct, save more.
                  </strong>{" "}
                  No markup or hidden platform fees — the price you see is what
                  the provider charges.
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
