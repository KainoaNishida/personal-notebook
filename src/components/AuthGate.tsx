import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Sprout } from "lucide-react";
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
  const [email, setEmail] = useState("");
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
          email.trim(),
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
        await api.signIn(email.trim(), password);
        setPassword("");
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready)
    return <div className="loading-screen">Opening your commonplace…</div>;
  if (signed && mode !== "recovery") return <>{children}</>;
  const expired = mode === "recovery" && !signed;
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <BookOpen size={26} />
          <span>
            commonplace<span className="brand-dot">.</span>
          </span>
        </div>
        <p className="eyebrow">A PRIVATE PLACE TO RETURN TO</p>
        <h1>
          A little more curious.
          <br />A little, every day.
        </h1>
        <p>
          Your ideas, your questions, your small discoveries.
          <br />A notebook for a life in progress.
        </p>
        <div className="login-art">
          <span />
          <span />
          <span />
        </div>
        <small>WRITE · EXPLORE · REFLECT</small>
      </div>
      <div className="login-form">
        <Sprout size={28} />
        <h2>
          {mode === "recovery"
            ? "Choose your password."
            : mode === "request"
              ? "Find your way back."
              : "Welcome back."}
        </h2>
        <p className="muted">
          {mode === "login"
            ? "A quiet space for what you’re learning."
            : mode === "request"
              ? "We’ll email a link to set a new journal password."
              : "Use a unique password with at least 12 characters."}
        </p>
        {api.configured ? (
          <form onSubmit={submit}>
            {mode !== "recovery" && (
              <label className="field">
                Email
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {mode !== "request" && !expired && (
              <label className="field">
                {mode === "recovery" ? "New password" : "Password"}
                <input
                  required
                  type="password"
                  minLength={mode === "recovery" ? 12 : undefined}
                  autoComplete={
                    mode === "recovery" ? "new-password" : "current-password"
                  }
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
                If this email belongs to the workspace owner, a reset link is on
                its way. Check your inbox and spam folder, then open the newest
                link.
              </p>
            )}
            {!expired && (
              <button className="primary wide" disabled={busy || sent}>
                {busy
                  ? "One moment…"
                  : mode === "request"
                    ? "Send reset link"
                    : mode === "recovery"
                      ? "Save password and open notebook"
                      : "Open my notebook"}
                <ArrowUpRight size={16} />
              </button>
            )}
            <button
              type="button"
              className="wide"
              disabled={busy}
              onClick={() =>
                switchMode(mode === "request" ? "login" : "request")
              }
            >
              {mode === "request"
                ? "Back to sign in"
                : mode === "login"
                  ? "Forgot or haven’t set a password?"
                  : "Request a new reset link"}
            </button>
            <p className="small muted">
              Single-owner workspace. Public registration is closed.
            </p>
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
      </div>
    </div>
  );
}
