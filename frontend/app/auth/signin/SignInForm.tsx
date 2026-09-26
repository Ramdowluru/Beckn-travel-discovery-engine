"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isValidEmail } from "@/lib/auth";
import { resetPasswordRequest, signInRequest } from "@/lib/api";

export default function SignInForm() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Email is required."); return; }
    if (!isValidEmail(email)) { setError("Enter a valid email address."); return; }
    if (!password)     { setError("Password is required."); return; }

    setLoading(true);
    setRecoveryMessage("");
    try {
      const response = await signInRequest(email, password);
      signIn(response.user);
    } catch {
      setError("We couldn’t complete sign in. Please try again.");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/trips");
  }

  async function handleForgotPassword() {
    setError("");
    setRecoveryMessage("");
    if (!email.trim()) { setError("Enter your email address to reset your password."); return; }
    if (!isValidEmail(email)) { setError("Enter a valid email address."); return; }

    setRecoveryLoading(true);
    try {
      const response = await resetPasswordRequest(email);
      setRecoveryMessage(response.message);
    } catch {
      setError("We couldn’t prepare a password reset. Please try again.");
    } finally {
      setRecoveryLoading(false);
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

      {/* ── Email ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="email" style={labelStyle}>Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ink)")}
          onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      {/* ── Password ──────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
          <label htmlFor="password" style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={recoveryLoading}
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 300,
              fontSize: "0.75rem",
              color: "var(--orange)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {recoveryLoading ? "Preparing reset..." : "Forgot password?"}
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, paddingRight: "3rem" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ink)")}
            onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
          />
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            style={{
              position: "absolute",
              right: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              letterSpacing: "0.06em",
              color: "var(--ink-muted)",
              padding: 0,
            }}
          >
            {showPass ? "HIDE" : "SHOW"}
          </button>
        </div>
      </div>

      {/* ── Error message ─────────────────────────────────────── */}
      {error && (
        <div
          style={{
            border: "1px solid var(--orange)",
            backgroundColor: "rgba(200,75,47,0.06)",
            padding: "0.65rem 1rem",
            marginBottom: "1.25rem",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 400,
              fontSize: "0.825rem",
              color: "var(--orange)",
            }}
          >
            {error}
          </p>
        </div>
      )}

      {recoveryMessage && (
        <div style={{ border: "1px solid var(--border)", backgroundColor: "var(--white)", padding: "0.65rem 1rem", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.825rem", color: "var(--ink-soft)" }}>{recoveryMessage}</p>
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          backgroundColor: loading ? "var(--ink-soft)" : "var(--ink)",
          color: "var(--white)",
          fontFamily: "var(--font-body)",
          fontWeight: 500,
          fontSize: "0.875rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          border: "none",
          padding: "0.9rem 0",
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background-color 0.15s",
        }}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      {/* ── Divider ───────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          margin: "1.5rem 0",
        }}
      >
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border)" }} />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontWeight: 300,
            fontSize: "0.75rem",
            color: "var(--ink-muted)",
          }}
        >
          or
        </span>
        <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border)" }} />
      </div>

      {/* ── Continue as guest ─────────────────────────────────── */}
      <button
        type="button"
        onClick={() => router.push("/")}
        style={{
          width: "100%",
          backgroundColor: "transparent",
          color: "var(--ink)",
          fontFamily: "var(--font-body)",
          fontWeight: 400,
          fontSize: "0.875rem",
          letterSpacing: "0.02em",
          border: "1px solid var(--border)",
          padding: "0.9rem 0",
          cursor: "pointer",
          transition: "background-color 0.15s",
        }}
      >
        Continue as guest
      </button>
    </form>
  );
}
