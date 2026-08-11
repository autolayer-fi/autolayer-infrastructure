import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="console-page-head">
      <div>
        <p className="console-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="console-page-actions">{actions}</div>}
    </header>
  );
}
export function Surface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`console-surface ${className}`}>{children}</section>
  );
}
export function SurfaceHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="console-surface-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon: ReactNode;
}) {
  return (
    <article className="console-metric">
      <div>
        <span>{label}</span>
        <i>{icon}</i>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="console-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="console-empty">
      <span>
        <LoaderCircle className="animate-spin" />
      </span>
      <h3>{label}</h3>
      <p>Fetching the latest workspace data.</p>
    </div>
  );
}
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="console-empty">
      <span className="error">
        <AlertTriangle />
      </span>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  optional = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <label className="console-field">
      <span>
        <b>{label}</b>
        <em>{optional ? "Optional" : "Required"}</em>
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function StatePill({ status }: { status: string }) {
  const value = status.toUpperCase();
  const tone =
    value === "ACTIVE" ||
    value === "PAID" ||
    value === "ONLINE" ||
    value === "LIVE"
      ? "success"
      : value === "FAILED" || value === "REVOKED" || value === "OFFLINE"
        ? "danger"
        : value === "PAUSED" || value === "PROPOSED" || value === "REQUIRED"
          ? "warning"
          : "neutral";
  return (
    <span className={`state-pill ${tone}`}>
      <i />
      {value}
    </span>
  );
}
