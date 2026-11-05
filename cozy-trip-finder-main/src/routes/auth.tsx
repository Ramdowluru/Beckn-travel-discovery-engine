import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Field } from "@/components/tde/Shell";
import { useTde } from "@/lib/tde/store";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — TDE Travel Discovery Engine" },
      { name: "description", content: "Sign in or create a TDE account to save your journeys." },
      { property: "og:title", content: "Sign in — TDE" },
      { property: "og:description", content: "One account. Every journey." },
    ],
  }),
  component: Auth,
});

function Auth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const { signIn } = useTde();
  const nav = useNavigate();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (mode === "up" && !f.name.trim()) er.name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(f.email)) er.email = "Enter a valid email address";
    if (f.password.length < 8) er.password = "Password must be at least 8 characters";
    setErr(er);
    if (Object.keys(er).length) return;
    signIn(mode === "up" ? f.name.split(" ")[0] : f.email.split("@")[0]);
    nav({ to: "/" });
  };
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <aside className="flex flex-col justify-between bg-forest p-8 text-forest-foreground md:p-14">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-12 items-center justify-center bg-forest-foreground font-serif text-lg text-forest">TDE</span>
          <div><p className="text-sm font-bold tracking-[0.12em]">TRAVEL DISCOVERY ENGINE</p><p className="text-xs text-forest-muted">One account. Every journey.</p></div>
        </div>
        <div className="my-12">
          <p className="eyebrow text-primary">Welcome to TDE</p>
          <h1 className="mt-4 text-5xl leading-none md:text-6xl">One search.<br />Every way to go.</h1>
          <p className="mt-6 max-w-md text-forest-muted">Compare flights, trains, buses, hotels and local experiences across India — then book directly with the provider.</p>
          <ul className="mt-8 grid max-w-md grid-cols-2 border border-forest-muted/30">
            {["Flights & Trains", "Hotels & Stays", "Local Experiences", "All in One Place"].map((x) => (
              <li key={x} className="border border-forest-muted/30 px-4 py-4 text-sm">{x}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-forest-muted">Academic prototype · bookings are simulated</p>
      </aside>
      <div className="flex items-center justify-center p-6 md:p-14">
        <div className="w-full max-w-md">
          <div className="grid grid-cols-2 border">
            {(["in", "up"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr({}); }} data-active={mode === m} className="btn data-[active=true]:bg-ink data-[active=true]:text-ink-foreground">
                {m === "in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <h2 className="mt-10 text-4xl">{mode === "in" ? "Welcome back" : "Start your journey"}</h2>
          <p className="mt-2 text-muted-foreground">{mode === "in" ? "Sign in to continue your journey" : "Create an account to save your journeys"}</p>
          <form onSubmit={submit} noValidate className="mt-8 space-y-5">
            {mode === "up" && (
              <Field label="Full name" error={err.name}><input className="field-input" aria-invalid={!!err.name} placeholder="Arjun Reddy" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            )}
            <Field label="Email" error={err.email}><input className="field-input" type="email" aria-invalid={!!err.email} placeholder="you@email.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Password" error={err.password} hint={mode === "up" ? "Minimum 8 characters" : undefined}>
              <div className="flex">
                <input className="field-input" type={show ? "text" : "password"} aria-invalid={!!err.password} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
                <button type="button" className="btn btn-outline border-l-0 text-xs" onClick={() => setShow(!show)}>{show ? "HIDE" : "SHOW"}</button>
              </div>
            </Field>
            <button className="btn btn-primary w-full">{mode === "in" ? "SIGN IN" : "CREATE ACCOUNT"}</button>
          </form>
          {mode === "in" ? (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
              <button className="btn btn-outline w-full" onClick={() => { signIn("Guest"); nav({ to: "/" }); }}>Continue as guest</button>
            </>
          ) : (
            <p className="mt-6 text-xs text-muted-foreground">By creating an account you agree to our Terms of Service and Privacy Policy.</p>
          )}
        </div>
      </div>
    </div>
  );
}
