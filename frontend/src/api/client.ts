import { getToken } from './session';

/** Backend origin from VITE_API_URL. Empty means same origin as the frontend. */
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** The server answered with a non-2xx status. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  /** Machine-readable code from the error envelope, e.g. "token_expired", "rate_limited". */
  readonly code: string;

  constructor(status: number, detail: string, code = 'error') {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

/** The server could not be reached at all (offline, DNS, CORS, backend down). */
export class NetworkError extends Error {
  constructor(message = 'Unable to reach the YieldSense server.') {
    super(message);
    this.name = 'NetworkError';
  }
}

type UnauthorizedHandler = (code: string) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registered by the auth provider: clears the session and sends the user to /login. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Raw body (e.g. FormData) sent as-is, without JSON encoding. */
  form?: FormData;
  /** Skip the global 401 handler (used by the login call, where 401 means "wrong password"). */
  skipAuthRedirect?: boolean;
}

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  const suffix = qs.toString();
  return `${API_URL}${path}${suffix ? `?${suffix}` : ''}`;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined && !opts.form) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NetworkError();
  }

  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`;
    let code = 'error';
    try {
      // Envelope: {"error": {"code", "message"}}
      const json = await res.json();
      if (typeof json?.error?.message === 'string') detail = json.error.message;
      if (typeof json?.error?.code === 'string') code = json.error.code;
    } catch {
      // Non-JSON error body: keep the status text.
    }
    if (res.status === 401 && !opts.skipAuthRedirect) onUnauthorized?.(code);
    throw new ApiError(res.status, detail, code);
  }
  return res;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload (FormData). */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const res = await send(path, { method: 'POST', form });
  return (await res.json()) as T;
}

/** For file downloads (CSV/XLSX exports). The filename comes from Content-Disposition when present. */
export async function apiBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await send(path, opts);
  const match = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') ?? '');
  return { blob: await res.blob(), filename: match?.[1] ?? null };
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
