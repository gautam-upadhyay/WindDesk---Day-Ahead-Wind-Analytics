import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  UserRound,
  Wind,
  X,
} from "lucide-react";

export type Theme = "light" | "dark";
export type AccountMode = "login" | "signup" | "account";
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: number;
  theme: Theme;
  default_cutoff: string;
}

export async function accountRequest(
  path: string,
  body?: object,
  method = "POST",
): Promise<User | null> {
  const response = await fetch(`/api/auth/${path}`, {
    signal: AbortSignal.timeout(15000),
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const detail =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail?.map((item: { msg: string }) => item.msg).join(". ");
    throw new Error(
      detail || "The account service is unavailable. Please try again.",
    );
  }
  return payload.user;
}

function AccountManagement({
  user,
  busy,
  setBusy,
  updated,
}: {
  user: User;
  busy: boolean;
  setBusy: (value: boolean) => void;
  updated: (user: User) => void;
}) {
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    kind: "profile" | "password",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setFeedback(null);
    if (
      kind === "password" &&
      fields.get("new-password") !== fields.get("confirm-password")
    ) {
      setFeedback({ kind: "error", text: "The new passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const current = await accountRequest(
        kind,
        kind === "profile"
          ? { name: fields.get("display-name") }
          : {
              current_password: fields.get("current-password"),
              new_password: fields.get("new-password"),
            },
        kind === "profile" ? "PUT" : "POST",
      );
      if (current) updated(current);
      if (kind === "password") form.reset();
      setFeedback({
        kind: "success",
        text:
          kind === "profile"
            ? "Profile updated."
            : "Password changed. Other sessions have been signed out.",
      });
    } catch (problem) {
      setFeedback({
        kind: "error",
        text:
          problem instanceof Error
            ? problem.message
            : "Unable to save. Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-management" aria-label="Profile and security">
      <details>
        <summary>
          Profile details <UserRound size={16} />
        </summary>
        <form onSubmit={(event) => submit(event, "profile")}>
          <label>
            Display name
            <input
              name="display-name"
              defaultValue={user.name}
              autoComplete="name"
              required
              minLength={1}
              maxLength={80}
            />
          </label>
          <button className="button" disabled={busy}>
            Update profile
          </button>
        </form>
      </details>
      <details>
        <summary>
          Change password <LockKeyhole size={16} />
        </summary>
        <p className="form-help">
          Confirm your current password. Updating it signs out your other
          sessions.
        </p>
        <form onSubmit={(event) => submit(event, "password")}>
          <label>
            Current password
            <input
              name="current-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label>
            New password
            <input
              name="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <button className="button" disabled={busy}>
            Update password
          </button>
        </form>
      </details>
      {feedback && (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={feedback.kind === "error" ? "form-error" : "form-success"}
        >
          {feedback.text}
        </p>
      )}
    </section>
  );
}

export default function AccountDialog({
  mode,
  user,
  theme,
  changeMode,
  close,
  authenticated,
  signedOut,
  preferencesSaved,
  userUpdated,
}: {
  mode: AccountMode;
  user: User | null;
  theme: Theme;
  changeMode: (mode: AccountMode) => void;
  close: () => void;
  authenticated: (user: User) => void;
  signedOut: () => void;
  preferencesSaved: (user: User) => void;
  userUpdated: (user: User) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setError("");
    setVisible(false);
    setSaved(false);
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (mode === "account") {
        const updated = await accountRequest(
          "preferences",
          { theme: form.get("theme"), default_cutoff: form.get("cutoff") },
          "PUT",
        );
        if (updated) {
          preferencesSaved(updated);
          setSaved(true);
        }
      } else {
        const body = {
          email: form.get("email"),
          password: form.get("password"),
          ...(mode === "signup" ? { name: form.get("name"), theme } : {}),
        };
        const current = await accountRequest(mode, body);
        if (current) authenticated(current);
      }
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await accountRequest("logout", {});
      signedOut();
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "Unable to log out.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-labelledby="account-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) close();
      }}
    >
      <div className="account-layout">
        <aside className="account-story" aria-label="Your WindDesk workspace">
          <span className="brand">
            <span className="brand-icon">
              <Wind size={24} />
            </span>
            winddesk<span className="brand-period">.</span>
          </span>
          <div>
            <span className="pill-label">A LITTLE MORE CLARITY</span>
            <h2>
              Good decisions
              <br />
              start with
              <br />
              <em>good context.</em>
            </h2>
            <p>Your own workspace for the next day’s wind picture.</p>
          </div>
          <span className="account-trust">
            <ShieldCheck size={18} /> Real Elexon data. Traceable decisions.
          </span>
        </aside>
        <section className="account-form-panel">
          <button
            className="icon-button account-close"
            aria-label="Close account dialog"
            onClick={close}
            disabled={busy}
          >
            <X size={20} />
          </button>
          <span className="account-symbol">
            <LockKeyhole size={24} />
          </span>
          <p className="eyebrow">
            {mode === "signup"
              ? "MAKE YOURSELF AT HOME"
              : mode === "login"
                ? "A CLEARER VIEW AWAITS"
                : "YOUR PERSONAL WORKSPACE"}
          </p>
          <h2 id="account-title">
            {mode === "signup"
              ? "Create your account"
              : mode === "login"
                ? "Welcome back."
                : "Your workspace."}
          </h2>
          <p className="account-intro">
            {mode === "signup"
              ? "Save your preferred theme and decision cutoff. The public pilot is always open to explore."
              : mode === "login"
                ? "Log in to pick up with your saved workspace preferences."
                : `Signed in as ${user?.email}. Your preferences follow your account.`}
          </p>
          <form key={mode} onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={1}
                  maxLength={80}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            {mode !== "account" ? (
              <>
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    placeholder="you@company.com"
                  />
                </label>
                <label>
                  Password
                  <span className="password-field">
                    <input
                      name="password"
                      type={visible ? "text" : "password"}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      minLength={mode === "signup" ? 12 : 1}
                      maxLength={128}
                      required
                      placeholder={
                        mode === "signup"
                          ? "At least 12 characters"
                          : "Your password"
                      }
                      aria-describedby={
                        mode === "signup" ? "password-help" : undefined
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {mode === "signup" && (
                  <p id="password-help" className="form-help">
                    Use 12–128 characters. A memorable passphrase works well.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="profile-summary">
                  <span className="avatar">
                    {user?.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{user?.name}</strong>
                    <small>
                      Member since{" "}
                      {new Date(
                        (user?.created_at ?? 0) * 1000,
                      ).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </small>
                  </div>
                </div>
                <label>
                  Default information cutoff
                  <select name="cutoff" defaultValue={user?.default_cutoff}>
                    {["09:00", "09:20", "15:00", "15:30"].map((cutoff) => (
                      <option key={cutoff} value={cutoff}>
                        {cutoff} GMT
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Preferred appearance
                  <select name="theme" defaultValue={user?.theme}>
                    <option value="light">Day mode</option>
                    <option value="dark">Night mode</option>
                  </select>
                </label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="form-success" role="status">
                <Check size={16} /> Workspace preferences saved.
              </p>
            )}
            <button className="button primary account-submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "login"
                    ? "Log in"
                    : "Save preferences"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === "account" && user && (
            <AccountManagement
              user={user}
              busy={busy}
              setBusy={setBusy}
              updated={userUpdated}
            />
          )}
          {mode === "account" ? (
            <button
              className="text-button logout-button"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={16} /> Log out
            </button>
          ) : (
            <p className="account-switch">
              {mode === "login"
                ? "New to WindDesk?"
                : "Already have an account?"}{" "}
              <button
                onClick={() =>
                  changeMode(mode === "login" ? "signup" : "login")
                }
                disabled={busy}
              >
                {mode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          )}
          <p className="form-help account-footnote">
            {mode === "account"
              ? "Your session expires after seven days. Log out on shared devices."
              : "Your details are stored by this app. No marketing emails or third-party sign-in required."}
          </p>
        </section>
      </div>
    </dialog>
  );
}
