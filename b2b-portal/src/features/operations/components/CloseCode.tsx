import { useRetryDelay } from "../../../shared/use-retry-delay";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../auth";
import { ApiError } from "../../../shared/api/client";
import { Feedback } from "../../../shared/components/Feedback";
import { Icon } from "../../../shared/components/Icon";
import { revealCode } from "../operation-service";
export function CloseCode({ tripId }: { tripId: string }) {
  const session = useAuthStore((state) => state.session);
  const [result, setResult] = useState<{
    code: string;
    expiresAt: string | null;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retryDelay = useRetryDelay(error);
  const request = useRef<AbortController | null>(null);
  function handleHide() {
    request.current?.abort();
    setResult(null);
    setError(null);
    setIsPending(false);
  }
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        request.current?.abort();
        setResult(null);
        setError(null);
        setIsPending(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      request.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
  useEffect(() => {
    if (!result) return;
    const delay = Math.max(
      0,
      Math.min(
        60_000,
        result.expiresAt ? Date.parse(result.expiresAt) - Date.now() : 60_000,
      ),
    );
    const timer = window.setTimeout(() => setResult(null), delay);
    return () => window.clearTimeout(timer);
  }, [result]);
  if (!session) return null;
  async function handleReveal() {
    if (!session || isPending || retryDelay > 0) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setError(null);
    setIsPending(true);
    try {
      const value = await revealCode(
        tripId,
        session.accessToken,
        controller.signal,
      );
      if (!controller.signal.aborted) setResult(value);
    } catch (value) {
      if (!controller.signal.aborted) {
        if (value instanceof ApiError && value.status === 401)
          useAuthStore.getState().clear(value.message);
        else setError(value);
      }
    } finally {
      if (!controller.signal.aborted) setIsPending(false);
    }
  }
  return (
    <section className="card close-code-card">
      <div className="card-title">
        <h2>Complete the journey</h2>
        <Icon name="shield" />
      </div>
      <p>
        Share this code with your assigned driver after the trip is complete.
      </p>
      {error !== null && (
        <Feedback
          error={error}
          onRetry={handleReveal}
          title="Close code unavailable"
        />
      )}
      <div
        className="code-display"
        aria-live="polite"
        aria-label={result ? "Revealed close code" : "Close code hidden"}
      >
        {result ? result.code : "••••••"}
      </div>
      {result ? (
        <button className="button secondary" onClick={handleHide}>
          Hide code
        </button>
      ) : (
        <button
          className="button primary"
          onClick={handleReveal}
          disabled={isPending || retryDelay > 0}
        >
          {isPending
            ? "Revealing…"
            : retryDelay
              ? `Try again in ${retryDelay}s`
              : "Reveal close code"}
          <Icon name="shield" size={18} />
        </button>
      )}
      <p className="small-note">
        Visible only on request. Automatically hidden after one minute, when you
        leave this page or switch tabs.
      </p>
    </section>
  );
}
