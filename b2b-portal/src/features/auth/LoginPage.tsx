import { useRetryDelay } from "../../shared/use-retry-delay";
import { useState } from "react";
import { useNavigate } from "react-router";
import { signIn } from "./auth-service";
import { useAuthStore } from "./auth-store";
import { Feedback } from "../../shared/components/Feedback";
import { Icon } from "../../shared/components/Icon";
import logo from "../../shared/assets/hired-logo.svg";
export function LoginPage() {
  const navigate = useNavigate();
  const notice = useAuthStore((state) => state.notice);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retryDelay = useRetryDelay(error);
  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || retryDelay > 0) return;
    setError(null);
    setIsPending(true);
    const revision = useAuthStore.getState().revision;
    try {
      const session = await signIn(email, password);
      if (useAuthStore.getState().revision !== revision) return;
      setPassword("");
      useAuthStore.getState().accept(session);
      navigate(session.user.passwordChangeRequired ? "/change-password" : "/", {
        replace: true,
      });
    } catch (value) {
      setError(value);
    } finally {
      setIsPending(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <img className="logo" src={logo} alt="HireD" />
        <div className="auth-story-content">
          <span className="pill">BUSINESS PORTAL</span>
          <h1>
            Your journeys.
            <br />
            One workspace.
          </h1>
          <p>
            Request a driver, follow every trip and keep your monthly records
            together.
          </p>
          <div className="journey-illustration" aria-hidden="true">
            <div className="journey-point">
              <Icon name="pin" />
              <span>From your next pickup</span>
            </div>
            <div className="journey-track">
              <span />
              <span />
              <span />
              <Icon name="trips" size={36} />
              <span />
              <span />
              <span />
            </div>
            <div className="journey-point end">
              <Icon name="check" />
              <span>To a trip well completed</span>
            </div>
          </div>
        </div>
        <p className="auth-footnote">
          A little less coordination. A lot more clarity.
        </p>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <span className="eyebrow">WELCOME TO HIRED</span>
          <h2>Good to see you.</h2>
          <p className="muted">Sign in to your company workspace.</p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error !== null && (
            <Feedback error={error} title="Sign-in unsuccessful" />
          )}
          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              maxLength={255}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              disabled={isPending || retryDelay > 0}
            />
            <div className="label-line">
              <label htmlFor="password">Password</label>
              <button
                className="text-button"
                type="button"
                aria-pressed={isVisible}
                onClick={() => setIsVisible(!isVisible)}
              >
                {isVisible ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="password"
              type={isVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isPending || retryDelay > 0}
            />
            <button
              className="button primary auth-submit"
              disabled={isPending || retryDelay > 0}
            >
              {isPending
                ? "Signing in…"
                : retryDelay
                  ? `Try again in ${retryDelay}s`
                  : "Sign in"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="auth-help">
            <Icon name="shield" />
            Your account is provided by your HireD administrator. Contact them
            if you need access or help signing in.
          </p>
        </div>
        <p className="auth-copyright">
          © {new Date().getFullYear()} HireD · Business travel, organised.
        </p>
      </section>
    </main>
  );
}
