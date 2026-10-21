import { useRetryDelay } from "../../shared/use-retry-delay";
import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../shared/api/client";
import { useAuthStore } from "../auth";
import { getCompany } from "../company";
import { usePortalQuery } from "../auth";
import { createOrder } from "./operation-service";
import { validateOrder } from "./order-validation";
import type { OrderFields } from "./order-validation";
import { PageHeader } from "../../shared/components/PageHeader";
import { Feedback } from "../../shared/components/Feedback";
import { Icon } from "../../shared/components/Icon";
import { RouteSummary } from "./components/RouteSummary";
import { formatDate } from "../../shared/format";
export function NewOrderPage() {
  const session = useAuthStore((state) => state.session);
  const navigate = useNavigate();
  const client = useQueryClient();
  const company = usePortalQuery(["company"], getCompany);
  const [fields, setFields] = useState<OrderFields>({
    pickup: "",
    drop: "",
    date: "",
    time: "",
    name: session?.user.fullName ?? "",
    phone: "",
    vehicle: "",
    notes: "",
    distance: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof OrderFields, string>>
  >({});
  const [isReview, setIsReview] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const retryDelay = useRetryDelay(error);
  const intent = useRef<{ body: string; key: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  if (!session) return <Navigate to="/login" replace />;
  function handleChange(name: keyof OrderFields, value: string) {
    setFields((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: undefined }));
    setError(null);
  }
  function handleReview(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateOrder(fields);
    setErrors(result.errors);
    if (!result.input) {
      const first = Object.keys(result.errors)[0];
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setIsReview(true);
    window.scrollTo({ top: 0 });
  }
  async function handleSubmit() {
    const result = validateOrder(fields);
    if (!session || !result.input || isPending || retryDelay > 0) return;
    setError(null);
    setIsPending(true);
    const revision = useAuthStore.getState().revision;
    const body = JSON.stringify(result.input);
    if (intent.current?.body !== body)
      intent.current = { body, key: crypto.randomUUID() };
    try {
      const saved = await createOrder(
        result.input,
        intent.current.key,
        session.accessToken,
        session.user.companyId,
      );
      if (useAuthStore.getState().revision !== revision) return;
      await client.invalidateQueries({
        queryKey: [
          "partner",
          session.user.id,
          session.user.companyId,
          "orders",
        ],
      });
      navigate(`/orders/${saved.id}`, {
        replace: true,
        state: { isCreated: true },
      });
    } catch (value) {
      if (value instanceof ApiError && value.status === 401)
        useAuthStore.getState().clear(value.message);
      else setError(value);
    } finally {
      setIsPending(false);
    }
  }
  function input(
    name: keyof OrderFields,
    label: string,
    type = "text",
    maxLength = 2000,
    placeholder?: string,
  ) {
    return (
      <label
        className={name === "pickup" || name === "drop" ? "full-width" : ""}
      >
        {label}
        <input
          name={name}
          type={type}
          maxLength={maxLength}
          required={!["distance", "vehicle", "notes"].includes(name)}
          value={fields[name]}
          placeholder={placeholder}
          onChange={(event) => handleChange(name, event.target.value)}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
        />
        {errors[name] && (
          <span className="field-error" id={`${name}-error`}>
            {errors[name]}
          </span>
        )}
      </label>
    );
  }
  const parsed = validateOrder(fields).input;
  return (
    <>
      <Link className="back-link" to="/orders">
        ← Orders & trips
      </Link>
      <PageHeader
        eyebrow="LET’S GET YOU MOVING"
        title={isReview ? "Review your request" : "Request a driver"}
        description={
          isReview
            ? "One final look before we send your request to HireD."
            : "Tell us where, when and who to contact. We’ll take it from there."
        }
      />
      <div className="order-form-layout">
        <section className="card form-card">
          <ol className="form-steps" aria-label="Request progress">
            <li className="active">
              <span>{isReview ? <Icon name="check" size={14} /> : "1"}</span>
              Trip details
            </li>
            <li className={isReview ? "active" : ""}>
              <span>2</span>Review & submit
            </li>
          </ol>
          {company.data?.isActive === false && (
            <p className="notice warning" role="alert">
              Your company is currently inactive. Contact HireD before
              requesting a new order.
            </p>
          )}
          {error !== null && (
            <Feedback error={error} title="Request not confirmed" />
          )}
          {isReview && parsed ? (
            <div className="review-content">
              <RouteSummary pickup={fields.pickup} drop={fields.drop} />
              <dl className="detail-grid">
                <div>
                  <dt>Pickup · IST</dt>
                  <dd>{formatDate(parsed.requestedPickupAt)}</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>
                    {fields.name}
                    <br />
                    {fields.phone}
                  </dd>
                </div>
                <div>
                  <dt>Vehicle notes</dt>
                  <dd>{fields.vehicle || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Service notes</dt>
                  <dd>{fields.notes || "Not provided"}</dd>
                </div>
              </dl>
              <p className="notice">
                Your request will be received for review. HireD confirms
                availability and pricing after reviewing it.
              </p>
              {error !== null && (
                <p className="muted">
                  If the response was interrupted, use Submit request again with
                  these same details to check the original request.
                </p>
              )}
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={isPending}
                  onClick={() => setIsReview(false)}
                >
                  Edit details
                </button>
                <button
                  className="button primary"
                  onClick={handleSubmit}
                  disabled={
                    isPending ||
                    retryDelay > 0 ||
                    company.data?.isActive === false
                  }
                >
                  {isPending
                    ? "Submitting…"
                    : retryDelay
                      ? `Try again in ${retryDelay}s`
                      : "Submit request"}
                  <Icon name="arrow" />
                </button>
              </div>
            </div>
          ) : (
            <form ref={form} onSubmit={handleReview} noValidate>
              <div className="form-section">
                <h2>
                  <span className="section-number">01</span>Where are we headed?
                </h2>
                <div className="form-grid">
                  {input(
                    "pickup",
                    "Pickup address",
                    "text",
                    2000,
                    "Building, street and city",
                  )}
                  {input(
                    "drop",
                    "Destination address",
                    "text",
                    2000,
                    "Where should the journey end?",
                  )}
                  {input("date", "Pickup date · IST", "date")}
                  {input("time", "Pickup time · IST", "time")}
                </div>
              </div>
              <div className="form-section">
                <h2>
                  <span className="section-number">02</span>A few helpful
                  details
                </h2>
                <div className="form-grid">
                  {input("name", "Contact name", "text", 150)}
                  {input("phone", "Contact phone", "tel", 30)}
                  {input(
                    "vehicle",
                    "Vehicle notes · optional",
                    "text",
                    2000,
                    "e.g. Automatic sedan",
                  )}
                  {input(
                    "distance",
                    "Road distance in km · optional",
                    "text",
                    10,
                    "e.g. 24.50",
                  )}
                  <label className="full-width">
                    Service notes · optional
                    <textarea
                      name="notes"
                      maxLength={2000}
                      rows={3}
                      value={fields.notes}
                      placeholder="Anything else we should know?"
                      onChange={(event) =>
                        handleChange("notes", event.target.value)
                      }
                    />
                    {errors.notes && (
                      <span className="field-error">{errors.notes}</span>
                    )}
                  </label>
                </div>
              </div>
              <div className="form-actions">
                <Link className="button secondary" to="/orders">
                  Cancel
                </Link>
                <button
                  className="button primary"
                  disabled={company.data?.isActive === false}
                >
                  Review request
                  <Icon name="arrow" />
                </button>
              </div>
            </form>
          )}
        </section>
        <aside className="request-aside">
          <div className="card request-note">
            <span className="round-icon">
              <Icon name="trips" size={26} />
            </span>
            <h3>A smoother ride starts here.</h3>
            <p>
              Send your requirements. HireD reviews the request and arranges the
              next steps.
            </p>
            <ol>
              <li>
                <span>1</span>Tell us about the journey
              </li>
              <li>
                <span>2</span>We review your request
              </li>
              <li>
                <span>3</span>Follow updates in your workspace
              </li>
            </ol>
          </div>
          <div className="quiet-note">
            <Icon name="clock" />
            <div>
              <strong>All schedules use IST</strong>
              <p>
                Pickup times are entered in Asia/Kolkata, wherever you sign in
                from.
              </p>
            </div>
          </div>
          <div className="quiet-note">
            <Icon name="pin" />
            <div>
              <strong>Estimate unavailable</strong>
              <p>
                A duration will appear when HireD has enough route information.
                Supplied distance is optional.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
