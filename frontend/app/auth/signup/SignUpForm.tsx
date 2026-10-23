"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isValidEmail } from "@/lib/auth";
import { ApiError, signUpRequest } from "@/lib/api";

export default function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");

    if (!name.trim()) { setError("Name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (!isValidEmail(email)) { setError("Enter a valid email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password.length > 128) { setError("Password must be 128 characters or fewer."); return; }

    setLoading(true);
    try {
      await signUpRequest(name, email, password);
      router.push("/auth/signin?signup=success");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setError("An account already exists for this email.");
      } else if (requestError instanceof ApiError && requestError.status === 422) {
        setError(requestError.message);
      } else if (requestError instanceof ApiError && requestError.status === 503) {
        setError("Authentication service is unavailable. Please try again.");
      } else {
        setError("We couldn’t create your account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
    fontSize: "0.6rem",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--ink-muted)",
    display: "block",
    marginBottom: "0.4rem",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: "var(--font-body)",
    fontWeight: 400,
    fontSize: "0.9rem",
    color: "var(--ink)",
    backgroundColor: "var(--white)",
    border: "1px solid var(--border)",
    padding: "0.75rem 1rem",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="name" style={labelStyle}>Full name</label>
        <input id="name" type="text" autoComplete="name" placeholder="Arjun Reddy" value={name}
          onChange={(e) => setName(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="email" style={labelStyle}>Email</label>
        <input id="email" type="email" autoComplete="email" placeholder="you@email.com" value={email}
          onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ marginBottom: "1.75rem" }}>
        <label htmlFor="password" style={labelStyle}>Password</label>
        <div style={{ position: "relative" }}>
          <input id="password" type={showPass ? "text" : "password"} autoComplete="new-password"
            placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: "3rem" }} />
          <button type="button" onClick={() => setShowPass((value) => !value)}
            aria-label={showPass ? "Hide password" : "Show password"}
            style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)",
              fontSize: "0.6rem", letterSpacing: "0.06em", color: "var(--ink-muted)", padding: 0 }}>
            {showPass ? "HIDE" : "SHOW"}
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" style={{ border: "1px solid var(--orange)", backgroundColor: "rgba(200,75,47,0.06)",
          padding: "0.65rem 1rem", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.825rem", color: "var(--orange)" }}>
            {error}
          </p>
        </div>
      )}
      <button type="submit" disabled={loading}
        style={{ width: "100%", backgroundColor: loading ? "var(--ink-soft)" : "var(--ink)",
          color: "var(--white)", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.875rem",
          letterSpacing: "0.06em", textTransform: "uppercase", border: "none", padding: "0.9rem 0",
          cursor: loading ? "not-allowed" : "pointer", transition: "background-color 0.15s" }}>
        {loading ? "Creating account..." : "Create account"}
      </button>
      <p style={{ fontFamily: "var(--font-body)", fontWeight: 300, fontSize: "0.72rem",
        color: "var(--ink-muted)", textAlign: "center", marginTop: "1rem", lineHeight: 1.6 }}>
        By creating an account you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  );
}
