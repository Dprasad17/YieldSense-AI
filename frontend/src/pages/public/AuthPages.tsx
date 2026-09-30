import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  Lock,
  ShieldCheck,
  Sprout,
  Tractor,
  User,
} from 'lucide-react';
import clsx from 'clsx';
import { ApiError } from '../../api/client';
import { ALL_NAV_ITEMS } from '../../app/navigation';
import { useAuth } from '../../auth/context';
import { hasPermission } from '../../auth/permissions';
import { DEMO_ACCOUNTS, type DemoAccount } from '../../auth/demoAccounts';
import { loginErrorMessage } from '../../auth/errors';
import { passwordStrength } from '../../lib/password';
import { Banner, Button, FormField, Input, Modal, TooltipProvider } from '../../components/ui';
import { LoadingState } from '../../components/ui/States';
import s from './public.module.css';

const ROLE_ICON = { Farmer: Tractor, Agronomist: FlaskConical, Admin: ShieldCheck } as const;

function useRedirectTarget(): string {
  const location = useLocation();
  const { user } = useAuth();
  const from = (location.state as { from?: string } | null)?.from;
  if (!from?.startsWith('/app/')) return '/app/dashboard';
  // Don't send someone back to a screen their role can't open (e.g. after switching accounts).
  const segment = from.slice(5).split(/[/?#]/)[0];
  const item = ALL_NAV_ITEMS.find(i => i.path === segment);
  if (item && user && !hasPermission(user.role, item.permission)) return '/app/dashboard';
  return from;
}

// ---------------------------------------------------------------- Layout

function AuthLayout({ children, title }: { children: ReactNode; title: string }) {
  useEffect(() => {
    document.title = `${title} · YieldSense AI`;
  }, [title]);
  return (
    <TooltipProvider>
      <div className={s.auth}>
        <aside className={clsx(s.brandPanel, 'contour-bg')}>
          <Link to="/" className={s.brandTop}>
            <span className={s.logo}>
              <Sprout size={20} aria-hidden="true" />
            </span>
            <span>
              YieldSense <span>AI</span>
            </span>
          </Link>
          <div>
            <h1 className={s.headline}>Know your harvest before you plant it.</h1>
            <p className={s.lede}>
              Yield predictions, weather and soil analysis, and practical recommendations for your crops.
            </p>
            <ul className={s.proof}>
              <li>
                <CheckCircle2 size={18} aria-hidden="true" /> Trained on 28,242 records across 101 countries and 10
                crops
              </li>
              <li>
                <CheckCircle2 size={18} aria-hidden="true" /> Live weather from Open-Meteo for any region
              </li>
              <li>
                <CheckCircle2 size={18} aria-hidden="true" /> Role-based access for farmers, agronomists and
                administrators
              </li>
            </ul>
          </div>
          <div className={s.miniPreview} aria-hidden="true">
            {[
              ['Farm records', '28,242'],
              ['Countries', '101'],
              ['Crops', '10'],
            ].map(([label, value]) => (
              <div key={label} className={s.previewCard}>
                <div className={s.previewLabel}>{label}</div>
                <div className={s.previewValue}>{value}</div>
              </div>
            ))}
          </div>
        </aside>
        <main className={s.formPanel}>
          <div className={s.formWrap}>{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------- Sign in

export function SignInPage() {
  const { status, login } = useAuth();
  const target = useRedirectTarget();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [pending, setPending] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (status === 'restoring') return <LoadingState label="Restoring your session…" fullPage />;
  if (status === 'authenticated') return <Navigate to={target} replace />;

  const doLogin = async (u: string, p: string, key: string) => {
    setPending(key);
    setError(null);
    try {
      // Once signed in, the component re-renders and redirects to a target the user's role can open.
      await login(u, p, remember);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? `${err.detail}` : loginErrorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const submit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs: typeof fieldErrors = {};
    if (!username.trim()) errs.username = 'Enter your username.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void doLogin(username, password, 'form');
  };

  const demo = (a: DemoAccount) => {
    setUsername(a.username);
    setPassword(a.password);
    void doLogin(a.username, a.password, a.username);
  };

  return (
    <AuthLayout title="Sign in">
      <div>
        <h2 className={s.formTitle}>Sign in</h2>
        <p className={s.formSub}>Welcome back. Sign in to continue to your dashboard.</p>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      <form className={s.form} onSubmit={submit} noValidate>
        <FormField label="Username" htmlFor="si-username" error={fieldErrors.username}>
          <Input
            id="si-username"
            icon={User}
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            invalid={!!fieldErrors.username}
            autoFocus
          />
        </FormField>
        <FormField label="Password" htmlFor="si-password" error={fieldErrors.password}>
          <div style={{ position: 'relative' }}>
            <Input
              id="si-password"
              icon={Lock}
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              invalid={!!fieldErrors.password}
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 6,
                top: 5,
                width: 28,
                height: 28,
                display: 'grid',
                placeItems: 'center',
                background: 'none',
                border: 0,
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
        </FormField>
        <div className={s.row}>
          <label className={s.check}>
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember me
          </label>
          <button type="button" className={s.linkBtn} onClick={() => setForgotOpen(true)}>
            Forgot password?
          </button>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={pending === 'form'} disabled={!!pending}>
          Sign in
        </Button>
      </form>

      <div className={s.divider}>or explore with a demo account</div>
      <div className={s.demoGrid}>
        {DEMO_ACCOUNTS.map(a => {
          const Icon = ROLE_ICON[a.role];
          return (
            <button
              key={a.username}
              type="button"
              className={s.demoCard}
              onClick={() => demo(a)}
              disabled={!!pending}
              aria-busy={pending === a.username || undefined}
            >
              <span className={s.demoIcon}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className={s.demoText}>
                <span className={s.demoRole}>{a.role}</span>
                <span className={s.demoDesc} style={{ display: 'block' }}>
                  {a.description}
                </span>
              </span>
              {pending === a.username ? (
                <span className="spin" aria-hidden="true">
                  …
                </span>
              ) : (
                <ArrowRight size={16} color="var(--muted)" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <p className={s.foot}>
        New to YieldSense?{' '}
        <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 'var(--weight-medium)' }}>
          Create an account
        </Link>
      </p>

      <Modal
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        title="Reset your password"
        description="Password resets are handled by your administrator. Contact them with your username and they can set a new password for you."
        footer={
          <Button variant="primary" onClick={() => setForgotOpen(false)}>
            Got it
          </Button>
        }
      />
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Register

const accountSchema = z
  .object({
    full_name: z.string().trim().max(80, 'Keep it under 80 characters.'),
    username: z
      .string()
      .trim()
      .min(3, 'At least 3 characters.')
      .max(32, 'At most 32 characters.')
      .regex(/^[A-Za-z0-9_.-]+$/, 'Letters, numbers, dot, dash and underscore only.'),
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(8, 'At least 8 characters.').max(72, 'At most 72 characters.'),
    confirm: z.string(),
  })
  .refine(v => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] });

type Account = z.infer<typeof accountSchema>;

const STRENGTH_COLOR = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--info)', 'var(--success)'];

export function RegisterPage() {
  const { status, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<Account>({ full_name: '', username: '', email: '', password: '', confirm: '' });
  const [role, setRole] = useState<'Farmer' | 'Agronomist'>('Farmer');
  const [errors, setErrors] = useState<Partial<Record<keyof Account, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === 'authenticated') return <Navigate to="/app/dashboard" replace />;

  const set = (k: keyof Account) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues(v => ({ ...v, [k]: e.target.value }));
  const strength = passwordStrength(values.password);

  const next = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const res = accountSchema.safeParse(values);
    if (!res.success) {
      const errs: Partial<Record<keyof Account, string>> = {};
      for (const issue of res.error.issues) errs[issue.path[0] as keyof Account] ??= issue.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep(2);
  };

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      await register({
        username: values.username.trim(),
        email: values.email.trim(),
        password: values.password,
        role,
        full_name: values.full_name.trim() || undefined,
      });
      toast.success('Account created. Welcome to YieldSense.');
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Create account">
      <div>
        <h2 className={s.formTitle}>Create your account</h2>
        <p className={s.formSub}>Two quick steps.</p>
      </div>
      <div className={s.steps} aria-label={`Step ${step} of 2`}>
        <span className={clsx(s.stepDot, s.stepActive)}>1</span> Account
        <span className={s.stepLine} />
        <span className={clsx(s.stepDot, step === 2 && s.stepActive)}>2</span> Role
      </div>
      {error && <Banner tone="danger">{error}</Banner>}

      {step === 1 ? (
        <form className={s.form} onSubmit={next} noValidate>
          <FormField label="Full name (optional)" htmlFor="rg-name" error={errors.full_name}>
            <Input id="rg-name" autoComplete="name" value={values.full_name} onChange={set('full_name')} />
          </FormField>
          <FormField
            label="Username"
            htmlFor="rg-username"
            error={errors.username}
            hint="3–32 characters: letters, numbers, . _ -"
          >
            <Input
              id="rg-username"
              autoComplete="username"
              value={values.username}
              onChange={set('username')}
              invalid={!!errors.username}
            />
          </FormField>
          <FormField label="Email" htmlFor="rg-email" error={errors.email}>
            <Input
              id="rg-email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={set('email')}
              invalid={!!errors.email}
            />
          </FormField>
          <FormField label="Password" htmlFor="rg-password" error={errors.password}>
            <Input
              id="rg-password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={set('password')}
              invalid={!!errors.password}
            />
          </FormField>
          {values.password && (
            <div aria-live="polite">
              <div className={s.strength} aria-hidden="true">
                {[0, 1, 2, 3].map(i => (
                  <span
                    key={i}
                    style={{ background: i < strength.score ? STRENGTH_COLOR[strength.score] : undefined }}
                  />
                ))}
              </div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                Password strength: {strength.label}
              </span>
            </div>
          )}
          <FormField label="Confirm password" htmlFor="rg-confirm" error={errors.confirm}>
            <Input
              id="rg-confirm"
              type="password"
              autoComplete="new-password"
              value={values.confirm}
              onChange={set('confirm')}
              invalid={!!errors.confirm}
            />
          </FormField>
          <Button type="submit" variant="primary" size="lg">
            Continue
          </Button>
        </form>
      ) : (
        <div className={s.form}>
          <fieldset className={s.roleChoice} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', marginBottom: 'var(--space-2)' }}
            >
              How will you use YieldSense?
            </legend>
            {DEMO_ACCOUNTS.filter(a => a.role !== 'Admin').map(a => {
              const Icon = ROLE_ICON[a.role];
              return (
                <label key={a.role} className={s.roleCard}>
                  <input
                    type="radio"
                    name="role"
                    value={a.role}
                    checked={role === a.role}
                    onChange={() => setRole(a.role as 'Farmer' | 'Agronomist')}
                  />
                  <span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        fontWeight: 'var(--weight-semibold)',
                      }}
                    >
                      <Icon size={16} aria-hidden="true" /> {a.role}
                    </span>
                    <span className={s.demoDesc}>{a.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
            Administrator access is granted by an existing administrator.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button icon={ArrowLeft} onClick={() => setStep(1)} disabled={pending}>
              Back
            </Button>
            <Button variant="primary" size="lg" onClick={create} loading={pending} style={{ flex: 1 }}>
              Create account
            </Button>
          </div>
        </div>
      )}

      <p className={s.foot}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 'var(--weight-medium)' }}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------- Session expired

export function SessionExpiredPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <AuthLayout title="Session expired">
      <div>
        <h2 className={s.formTitle}>Your session has expired</h2>
        <p className={s.formSub}>For your security you were signed out. Sign in again to pick up where you left off.</p>
      </div>
      <Button variant="primary" size="lg" onClick={() => navigate('/login', { state: { from } })}>
        Sign in again
      </Button>
    </AuthLayout>
  );
}
