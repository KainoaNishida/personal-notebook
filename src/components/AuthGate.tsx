import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import * as api from "../service";
import { ErrorNotice } from "./UI";
type Mode = "login" | "request" | "recovery";
export function AuthGate({ children }: { children: ReactNode }) {
  const query = useQueryClient();
  // Capture the recovery intent before the auth client removes URL fragments.
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(window.location.search).has("reset") ||
    new URLSearchParams(window.location.hash.slice(1)).get("type") ===
      "recovery"
      ? "recovery"
      : "login",
  );
  const [ready, setReady] = useState(api.demo);
  const [signed, setSigned] = useState(api.demo);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (api.demo) return;
    let active = true;
    const sub = api.supabase?.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setSigned(!!session);
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
      if (!session) query.clear();
    });
    void api
      .getSession()
      .then((session) => {
        if (active) {
          setSigned(!!session);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Your sign-in link could not be opened. Request a new password reset link below.",
          );
          setReady(true);
        }
      });
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [query]);
  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setError("");
    setSent(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (mode === "recovery" && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "request") {
        const result = await api.supabase!.auth.resetPasswordForEmail(
          api.ownerEmail,
          {
            redirectTo: `${window.location.origin}/?reset=1`,
          },
        );
        if (result.error) throw result.error;
        setSent(true);
      } else if (mode === "recovery") {
        if (!signed)
          throw new Error("This reset link has expired. Request a new one.");
        const result = await api.supabase!.auth.updateUser({ password });
        if (result.error) throw result.error;
        setPassword("");
        setConfirmation("");
        window.history.replaceState(null, "", window.location.pathname);
        setMode("login");
      } else {
        await api.signIn(password);
        setPassword("");
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return <div className="loading-screen">Opening Kai’s Journal…</div>;
  if (signed && mode !== "recovery") return <>{children}</>;
  const expired = mode === "recovery" && !signed;
  return (
    <main className="login">
      <section className="login-form">
        <h1 id="auth-heading">
          {mode === "recovery"
            ? "Choose your password"
            : mode === "request"
              ? "Reset your password"
              : "Password to enter"}
        </h1>
        {mode !== "login" && (
          <p className="muted">
            {mode === "request"
              ? "Send a reset link to your account’s email."
              : "Use a unique password with at least 12 characters."}
          </p>
        )}
        {api.configured && api.ownerEmail ? (
          <form onSubmit={submit} aria-busy={busy}>
            {mode === "login" && (
              <div className="password-entry">
                <input
                  type="hidden"
                  name="username"
                  autoComplete="username"
                  value={api.ownerEmail}
                  readOnly
                />
                <input
                  id="entry-password"
                  required
                  type="password"
                  name="password"
                  aria-labelledby="auth-heading"
                  autoComplete="current-password"
                  disabled={busy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={busy}
                  aria-label={busy ? "Signing in" : "Enter notebook"}
                >
                  {busy ? (
                    <LoaderCircle size={18} aria-hidden="true" />
                  ) : (
                    <ArrowRight size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            )}
            {mode === "recovery" && !expired && (
              <label className="field">
                New password
                <input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {mode === "recovery" && !expired && (
              <label className="field">
                Confirm password
                <input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            )}
            <ErrorNotice
              error={
                expired
                  ? "This reset link is missing or expired. Request a fresh link to continue."
                  : error
              }
            />
            {sent && (
              <p role="status">
                A reset link is on its way. Check your inbox and spam folder,
                then open the newest link.
              </p>
            )}
            {mode !== "login" && !expired && (
              <button className="primary wide" disabled={busy || sent}>
                {busy
                  ? "One moment…"
                  : mode === "request"
                    ? "Send reset link"
                    : "Save password and open notebook"}
              </button>
            )}
            <button
              type="button"
              className="login-help"
              disabled={busy}
              onClick={() =>
                switchMode(mode === "request" ? "login" : "request")
              }
            >
              {mode === "request"
                ? "Back to sign in"
                : mode === "login"
                  ? "Forgot password?"
                  : "Request a new reset link"}
            </button>
          </form>
        ) : (
          <div className="context-card">
            <h3>Your workspace is ready to connect.</h3>
            <p className="muted">
              Configure the private backend to enable sign-in, sync, and your
              notebooks. See the deployment guide in this repository.
            </p>
            <p className="small muted">
              No private data or shared password is included in this
              application.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
