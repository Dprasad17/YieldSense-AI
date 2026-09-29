import { ApiError, isNetworkError } from '../api/client';

/** Human message for a failed sign-in. */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) return 'Incorrect username or password.';
  if (err instanceof ApiError) return err.detail;
  if (isNetworkError(err)) return "Can't reach the YieldSense server. Check your connection and try again.";
  return 'Sign-in failed. Please try again.';
}
