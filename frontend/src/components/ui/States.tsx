import { Link } from 'react-router-dom';
import { AlertTriangle, FlaskConical, RefreshCw, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import { errorMessage } from '../../api/client';
import styles from './states.module.css';

interface ErrorStateProps {
  title?: string;
  error?: unknown;
  message?: string;
  onRetry?: () => void;
  fullPage?: boolean;
}

export function ErrorState({ title = "Couldn't load this data", error, message, onRetry, fullPage }: ErrorStateProps) {
  return (
    <div className={clsx(styles.state, fullPage && styles.fullPage)} role="alert">
      <span className={styles.icon} aria-hidden="true">
        <AlertTriangle size={20} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message ?? (error ? errorMessage(error) : 'Please try again.')}</p>
      {onRetry && (
        <div className={styles.actions}>
          <button type="button" className={clsx(styles.button, styles.buttonPrimary)} onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', fullPage }: { label?: string; fullPage?: boolean }) {
  return (
    <div className={clsx(styles.state, fullPage && styles.fullPage)} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.message}>{label}</span>
    </div>
  );
}

interface StatusPageProps {
  code: string;
  title: string;
  message: string;
  /** Replaces the default "Go to dashboard" link with a button. */
  action?: { label: string; onClick: () => void };
}

export function StatusPage({ code, title, message, action }: StatusPageProps) {
  return (
    <div className={clsx(styles.state, styles.fullPage)}>
      <span className={styles.code}>{code}</span>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        {action ? (
          <button type="button" className={clsx(styles.button, styles.buttonPrimary)} onClick={action.onClick}>
            {action.label}
          </button>
        ) : (
          <Link to="/app/dashboard" className={clsx(styles.button, styles.buttonPrimary)}>
            Go to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}

/** Marks a card whose data is not yet computed from the real dataset. */
export function SampleDataPill({ reason }: { reason?: string }) {
  return (
    <span className={styles.pill} title={reason ?? 'Illustrative values. Not computed from the dataset yet.'}>
      <FlaskConical size={12} aria-hidden="true" />
      Sample data
    </span>
  );
}

export function OfflineDemoBanner() {
  return (
    <div className={styles.banner} role="status">
      <WifiOff size={16} aria-hidden="true" />
      Offline demo mode: the server is unreachable, so live data is unavailable.
    </div>
  );
}
