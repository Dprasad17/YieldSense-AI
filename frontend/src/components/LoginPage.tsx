import React, { useState } from 'react';
import { Sprout, UserCheck, Lock, Mail, ArrowRight } from 'lucide-react';
import { useAuth } from '../auth/context';
import { DEMO_ACCOUNTS } from '../auth/demoAccounts';
import { loginErrorMessage } from '../auth/errors';

/** Interim sign-in screen with corrected auth logic. Redesigned as a split layout in Phase 6. */
export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Farmer' | 'Agronomist'>('Farmer');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fillDemo = (demoUsername: string) => {
    const account = DEMO_ACCOUNTS.find(a => a.username === demoUsername);
    if (!account) return;
    setIsRegister(false);
    setUsername(account.username);
    setPassword(account.password);
    setError(null);
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isRegister) await register({ username, email, password, role });
      else await login(username, password);
      // LoginRoute redirects once the session is set.
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--text-sm)',
    color: 'var(--muted)',
    marginBottom: 'var(--space-1)',
    fontWeight: 'var(--weight-medium)',
  };
  const iconStyle: React.CSSProperties = { position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--canvas)', padding: 'var(--space-8)' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ background: 'var(--primary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', display: 'inline-flex' }}>
            <Sprout size={32} color="var(--primary-ink)" aria-hidden="true" />
          </div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: 'var(--ink)', margin: 0 }}>
            YieldSense <span style={{ color: 'var(--primary)' }}>AI</span>
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', margin: 0 }}>
            {isRegister ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {!isRegister && (
          <div style={{ background: 'var(--surface-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 'var(--space-2)', textAlign: 'center' }}>
              Explore with a demo account
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {DEMO_ACCOUNTS.map(a => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => fillDemo(a.username)}
                  title={a.description}
                  className={`tab-btn${username === a.username ? ' active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {a.role}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label htmlFor="login-username" style={labelStyle}>Username</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-control"
                style={{ width: '100%', paddingLeft: 'var(--space-10)' }}
                placeholder="Enter username"
                required
              />
              <UserCheck size={16} color="var(--muted)" style={iconStyle} aria-hidden="true" />
            </div>
          </div>

          {isRegister && (
            <div>
              <label htmlFor="login-email" style={labelStyle}>Email address</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-control"
                  style={{ width: '100%', paddingLeft: 'var(--space-10)' }}
                  placeholder="name@example.com"
                  required
                />
                <Mail size={16} color="var(--muted)" style={iconStyle} aria-hidden="true" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="login-password" style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-control"
                style={{ width: '100%', paddingLeft: 'var(--space-10)' }}
                placeholder="••••••••"
                required
              />
              <Lock size={16} color="var(--muted)" style={iconStyle} aria-hidden="true" />
            </div>
          </div>

          {isRegister && (
            <div>
              <label htmlFor="login-role" style={labelStyle}>I am a</label>
              <select
                id="login-role"
                value={role}
                onChange={e => setRole(e.target.value as 'Farmer' | 'Agronomist')}
                className="input-control"
                style={{ width: '100%' }}
              >
                <option value="Farmer">Farmer</option>
                <option value="Agronomist">Agronomist</option>
              </select>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center', width: '100%', marginTop: 'var(--space-2)' }}>
            <span>{loading ? (isRegister ? 'Creating account…' : 'Signing in…') : isRegister ? 'Create account' : 'Sign in'}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer', font: 'inherit' }}
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
};
