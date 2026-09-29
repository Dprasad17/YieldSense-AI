import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Sprout, RefreshCw, LogOut, UserCircle2 } from 'lucide-react';
import { NAV_ITEMS } from '../app/navigation';
import { useAuth, useCan } from '../auth/context';
import { filtersSearch } from '../store/filters';

/** Interim top navigation (routes + RBAC). Replaced by the sidebar shell in Phase 5. */
export const Header: React.FC = () => {
  const { user, role, logout } = useAuth();
  const can = useCan();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching() > 0;
  const [params] = useSearchParams();
  const search = filtersSearch(params);

  return (
    <header className="header-bar">
      <div className="brand-logo">
        <div style={{ background: 'var(--primary)', padding: 'var(--space-2)', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
          <Sprout size={22} color="var(--primary-ink)" aria-hidden="true" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', lineHeight: 1 }}>
          <span style={{ color: 'var(--ink)', fontWeight: 'var(--weight-bold)' }}>YieldSense</span>
          <span style={{ color: 'var(--primary)', fontWeight: 'var(--weight-bold)' }}>AI</span>
        </div>
      </div>

      <nav className="nav-tabs" aria-label="Main">
        {NAV_ITEMS.filter(item => can(item.permission)).map(item => (
          <NavLink
            key={item.path}
            to={{ pathname: `/app/${item.path}`, search }}
            className={({ isActive }) => `tab-btn${isActive ? ' active' : ''}`}
          >
            <item.icon size={15} aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries()}
          aria-label="Refresh data"
          title="Refresh data"
          className="tab-btn"
          disabled={isFetching}
        >
          <RefreshCw size={16} className={isFetching ? 'spin' : undefined} aria-hidden="true" />
        </button>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            <UserCircle2 size={18} color="var(--muted)" aria-hidden="true" />
            <span style={{ color: 'var(--ink)', fontWeight: 'var(--weight-medium)' }}>{user.full_name}</span>
            <span
              style={{
                background: 'var(--primary-soft)',
                color: 'var(--primary)',
                padding: '0 var(--space-2)',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {role}
            </span>
          </div>
        )}

        <button type="button" onClick={logout} className="tab-btn" aria-label="Sign out" title="Sign out">
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
