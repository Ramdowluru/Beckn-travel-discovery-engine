import Link from "next/link";

const footerLinks = {
  EXPLORE: [
    { label: "Flights & trains", href: "/results?tab=travel" },
    { label: "Hotels & stays", href: "/results?tab=stays" },
    { label: "Experiences", href: "/results?tab=experiences" },
  ],
  COMPANY: [
    { label: "About us", href: "/about" },
    { label: "Become a partner", href: "/partners/join" },
    { label: "Careers", href: "/careers" },
  ],
  SUPPORT: [
    { label: "Help center", href: "/help" },
    { label: "Cancellations", href: "/help/cancellations" },
    { label: "Contact us", href: "/help/contact" },
  ],
};

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--forest)",
        borderTop: "1px solid var(--border-dark)",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "3.5rem 2rem 2rem",
        }}
      >
        {/* Top row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto auto",
            gap: "4rem",
            marginBottom: "3rem",
          }}
        >
          {/* Tagline */}
          <div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                fontSize: "1.5rem",
                color: "var(--cream)",
                lineHeight: 1.3,
                marginBottom: "1rem",
              }}
            >
              One journey.
              <br />
              Many providers.
            </p>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.8rem",
                color: "rgba(242,237,228,0.45)",
                lineHeight: 1.7,
                maxWidth: "280px",
              }}
            >
              TDE connects transport, lodging, and local experience networks
              into a single, direct, peer-to-peer transaction stream.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <p
                className="tag"
                style={{
                  color: "var(--orange)",
                  marginBottom: "1rem",
                }}
              >
                {group}
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: 300,
                        fontSize: "0.825rem",
                        color: "rgba(242,237,228,0.6)",
                        textDecoration: "none",
                        transition: "color 0.15s",
                      }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div
          style={{
            borderTop: "1px solid var(--border-dark)",
            paddingTop: "1.25rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "0.75rem",
              color: "rgba(242,237,228,0.3)",
            }}
          >
            © 2026 TDE. All bookings made directly with partners.
          </p>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <Link
              href="/terms"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.75rem",
                color: "rgba(242,237,228,0.3)",
                textDecoration: "none",
              }}
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 300,
                fontSize: "0.75rem",
                color: "rgba(242,237,228,0.3)",
                textDecoration: "none",
              }}
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
