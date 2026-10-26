import { useRetryDelay } from "../../shared/use-retry-delay";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuthStore } from "./auth-store";
import { changePassword } from "./auth-service";
import { Feedback } from "../../shared/components/Feedback";
import { Icon } from "../../shared/components/Icon";
import logo from "../../shared/assets/hired-logo.svg";
export function ChangePasswordPage() {
  const session = useAuthStore((state) => state.session);
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState("");
  const retryDelay = useRetryDelay(error);
  if (!session) return <Navigate to="/login" replace />;
  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || isPending || retryDelay > 0) return;
    if (
      password.length < 15 ||
      password.length > 128 ||
      password === current ||
      password !== confirmation
    ) {
      setValidation(
        "Use a different password of 15–128 characters and make sure both new passwords match.",
      );
      return;
    }
    setValidation("");
    setError(null);
    setIsPending(true);
    try {
      await changePassword(session.accessToken, current, password);
      setCurrent("");
      setPassword("");
      setConfirmation("");
      useAuthStore
        .getState()
        .clear("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (value) {
      setError(value);
    } finally {
      setIsPending(false);
    }
  }
  return (
    <main className="password-page">
      <img className="logo" src={logo} alt="HireD" />
      <section className="card password-card">
        <span className="round-icon">
          <Icon name="shield" size={28} />
        </span>
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>
          {session.user.passwordChangeRequired
            ? "Make this account yours."
            : "Change your password"}
        </h1>
        <p className="muted">
          {session.user.passwordChangeRequired
            ? "Choose a new password before opening your company workspace."
            : "Updating your password signs you out on all devices."}
        </p>
        {error !== null && (
          <>
            <Feedback error={error} title="Password change not confirmed" />
            <p className="muted">
              If the connection was interrupted, try signing in with your new
              password before submitting again.
            </p>
          </>
        )}
        {validation && (
          <p className="field-error" role="alert">
            {validation}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="current">Current password</label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            disabled={isPending || retryDelay > 0}
          />
          <label htmlFor="new">New password</label>
          <input
            id="new"
            type="password"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
            aria-describedby="password-help"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isPending || retryDelay > 0}
          />
          <p id="password-help" className="field-help">
            15–128 characters. Spaces are welcome.
          </p>
          <label htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={isPending || retryDelay > 0}
          />
          <button
            className="button primary auth-submit"
            disabled={isPending || retryDelay > 0}
          >
            {isPending
              ? "Updating password…"
              : retryDelay
                ? `Try again in ${retryDelay}s`
                : "Update password"}
            <Icon name="arrow" />
          </button>
        </form>
        <button
          className="text-button"
          disabled={isPending || retryDelay > 0}
          onClick={() => {
            useAuthStore
              .getState()
              .clear(
                "Sign in with your new password if a previous change may have succeeded.",
              );
            navigate("/login");
          }}
        >
          Return to sign in
        </button>
      </section>
    </main>
  );
}
