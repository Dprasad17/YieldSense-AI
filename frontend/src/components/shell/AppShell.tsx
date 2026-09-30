import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ChevronsLeft,
  HelpCircle,
  UserCog,
  WifiOff,
  ChevronsRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sprout,
  Sun,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { ALL_NAV_ITEMS, FOOTER_ITEMS, NAV_GROUPS } from '../../app/navigation';
import { ProductTour } from './ProductTour';
import { useAuth, useCan } from '../../auth/context';
import { useDatasetSummary, useRegions } from '../../hooks/queries';
import { YIELD_UNITS, type YieldUnit } from '../../lib/units';
import { filtersSearch, useGlobalFilters } from '../../store/filters';
import { usePreferences, type ThemePreference } from '../../store/preferences';
import {
  Badge,
  Breadcrumbs,
  Button,
  Drawer,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  FormField,
  IconButton,
  Kbd,
  Popover,
  SegmentedControl,
  Select,
  TooltipProvider,
} from '../ui';
import { LoadingState, OfflineDemoBanner } from '../ui/States';
import { Banner } from '../ui';
import s from './shell.module.css';

const COLLAPSE_KEY = 'yieldsense_sidebar_collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Sidebar

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const can = useCan();
  const [params] = useSearchParams();
  const search = filtersSearch(params);
  return (
    <nav className={s.nav} aria-label="Main">
      {NAV_GROUPS.map(group => {
        const items = group.items.filter(i => can(i.permission));
        if (!items.length) return null;
        return (
          <div key={group.label} className={s.group}>
            <div className={s.groupLabel}>{group.label}</div>
            {items.map(item => (
              <NavLink
                key={item.path}
                to={{ pathname: `/app/${item.path}`, search }}
                className={({ isActive }) => clsx(s.navItem, isActive && s.active)}
                title={collapsed ? item.label : undefined}
                onClick={onNavigate}
                data-tour={item.path === 'predict' ? 'predict' : undefined}
              >
                <item.icon size={18} aria-hidden="true" />
                <span className={s.navLabel}>{item.label}</span>
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function FooterNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const can = useCan();
  return (
    <>
      {FOOTER_ITEMS.filter(i => can(i.permission)).map(item => (
        <NavLink
          key={item.path}
          to={`/app/${item.path}`}
          className={({ isActive }) => clsx(s.navItem, isActive && s.active)}
          title={collapsed ? item.label : undefined}
          onClick={onNavigate}
        >
          <item.icon size={18} aria-hidden="true" />
          <span className={s.navLabel}>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function Brand() {
  return (
    <Link to="/app/dashboard" className={s.brand} aria-label="YieldSense AI home">
      <span className={s.logo}>
        <Sprout size={18} aria-hidden="true" />
      </span>
      <span className={s.brandName}>
        YieldSense <span>AI</span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------- Context switcher

function ContextSwitcher() {
  const { filters, setFilters } = useGlobalFilters();
  const { unit, setUnit } = usePreferences();
  const regions = useRegions().data ?? [];
  const crops = useDatasetSummary().data?.crops_supported;
  const sortedCrops = useMemo(() => [...(crops ?? [])].sort((a, b) => a.localeCompare(b)), [crops]);
  return (
    <Popover
      align="start"
      trigger={
        <button type="button" className={s.context} title="Change region, crop and units" data-tour="context">
          <span className="sr-only">Context: </span>
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span className={s.contextText}>
            {filters.region || 'All regions'} <span className={s.contextSep}>·</span> {filters.crop || 'All crops'}
          </span>
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <FormField label="Region" htmlFor="ctx-region">
          <Select
            id="ctx-region"
            value={filters.region}
            onChange={e => setFilters({ region: e.target.value })}
            options={regions}
            placeholder="All regions"
          />
        </FormField>
        <FormField label="Crop" htmlFor="ctx-crop">
          <Select
            id="ctx-crop"
            value={filters.crop}
            onChange={e => setFilters({ crop: e.target.value })}
            options={sortedCrops}
            placeholder="All crops"
          />
        </FormField>
        <div>
          <div
            style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', marginBottom: 'var(--space-1)' }}
          >
            Yield unit
          </div>
          <SegmentedControl<YieldUnit>
            label="Yield unit"
            value={unit}
            onChange={setUnit}
            options={YIELD_UNITS.map(u => ({ value: u, label: u }))}
          />
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
          Applies to every screen that supports these filters. The selection is kept in the URL, so views can be shared.
        </p>
        {(filters.region || filters.crop) && (
          <Button size="sm" variant="ghost" onClick={() => setFilters({ region: '', crop: '' })}>
            Clear filters
          </Button>
        )}
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------- Sync status

function useLastUpdated(): number {
  const qc = useQueryClient();
  const [, tick] = useState(0);
  const fetching = useIsFetching();
  useEffect(() => {
    const id = window.setInterval(() => tick(n => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  void fetching;
  return Math.max(
    0,
    ...qc
      .getQueryCache()
      .getAll()
      .map(q => q.state.dataUpdatedAt || 0),
  );
}

function relative(ts: number): string {
  if (!ts) return 'Not synced yet';
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 45) return 'Synced just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `Synced ${min} min ago`;
  return `Synced ${Math.round(min / 60)} h ago`;
}

function SyncStatus() {
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  const last = useLastUpdated();
  return (
    <>
      <span className={s.sync} role="status" aria-live="polite">
        {fetching ? 'Syncing…' : relative(last)}
      </span>
      <IconButton
        icon={RefreshCw}
        label="Refresh data"
        onClick={() => qc.invalidateQueries()}
        disabled={fetching}
        className={fetching ? 'spin' : undefined}
      />
    </>
  );
}

// ---------------------------------------------------------------- Theme + user

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ThemeToggle() {
  const { theme, setTheme } = usePreferences();
  const next: Record<ThemePreference, ThemePreference> = { dark: 'light', light: 'system', system: 'dark' };
  const current = THEME_OPTIONS.find(o => o.value === theme) ?? THEME_OPTIONS[1];
  return (
    <IconButton
      icon={current.icon}
      label={`Theme: ${current.label}. Switch to ${next[theme]}`}
      onClick={() => setTheme(next[theme])}
    />
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(p => /^[A-Za-z]/.test(p))
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase())
    .join('');
}

function UserMenu() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = usePreferences();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button type="button" className={s.user} title="Account menu" data-account-menu>
          <span className={s.avatar} aria-hidden="true">
            {initials(user.full_name) || user.username[0]?.toUpperCase()}
          </span>
          <span className={s.userName}>{user.full_name}</span>
          <span className="sr-only"> account menu</span>
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>
          <div style={{ color: 'var(--ink)', fontSize: 'var(--text-md)', fontWeight: 'var(--weight-medium)' }}>
            {user.full_name}
          </div>
          <div style={{ marginTop: 2, display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            {user.email} <Badge tone="success">{role}</Badge>
          </div>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem icon={UserCog} onSelect={() => navigate('/app/settings')}>
          Profile & settings
        </DropdownItem>
        <DropdownItem icon={HelpCircle} onSelect={() => navigate('/app/help')}>
          Help center
        </DropdownItem>
        <DropdownSeparator />
        {THEME_OPTIONS.map(o => (
          <DropdownItem key={o.value} icon={o.icon} onSelect={() => setTheme(o.value)}>
            {o.label} theme {theme === o.value && '✓'}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem icon={LogOut} danger onSelect={logout}>
          Sign out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------- Command palette

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const can = useCan();
  const { setTheme } = usePreferences();
  const { logout } = useAuth();
  const { search } = useGlobalFilters();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay)',
            zIndex: 'var(--z-overlay)' as unknown as number,
          }}
        />
        <Dialog.Content className={s.palette} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command label="Command palette" loop>
            <Command.Input placeholder="Search screens and actions…" autoFocus />
            <Command.List>
              <Command.Empty>No results.</Command.Empty>
              <Command.Group heading="Go to">
                {ALL_NAV_ITEMS.filter(i => can(i.permission)).map(item => (
                  <Command.Item
                    key={item.path}
                    value={`${item.label} ${item.keywords ?? ''}`}
                    onSelect={() => run(() => navigate(`/app/${item.path}${search}`))}
                  >
                    <item.icon size={16} aria-hidden="true" />
                    {item.label}
                  </Command.Item>
                ))}
                <Command.Item value="design system components" onSelect={() => run(() => navigate('/design-system'))}>
                  <Palette size={16} aria-hidden="true" />
                  Design system
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Preferences">
                {THEME_OPTIONS.map(o => (
                  <Command.Item key={o.value} value={`theme ${o.label}`} onSelect={() => run(() => setTheme(o.value))}>
                    <o.icon size={16} aria-hidden="true" />
                    Switch to {o.label.toLowerCase()} theme
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Account">
                <Command.Item value="sign out logout" onSelect={() => run(logout)}>
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------- Shell

export function AppShell() {
  const { offlineDemo, user } = useAuth();
  const online = useOnline();
  const { defaultRegion, defaultCrop } = usePreferences();
  const { filters, setFilters } = useGlobalFilters();
  const [appliedDefaults] = useState(() => ({ region: filters.region, crop: filters.crop }));
  useEffect(() => {
    // Apply the user's default context once, only where the URL doesn't already set one.
    const patch: { region?: string; crop?: string } = {};
    if (!appliedDefaults.region && defaultRegion) patch.region = defaultRegion;
    if (!appliedDefaults.crop && defaultCrop) patch.crop = defaultCrop;
    if (Object.keys(patch).length) setFilters(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(c => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // preference just won't persist
      }
      return !c;
    });
  };

  const segment = location.pathname.split('/')[2] ?? '';
  const current = ALL_NAV_ITEMS.find(i => i.path === segment);
  const group = NAV_GROUPS.find(g => g.items.some(i => i.path === segment));
  useEffect(() => {
    document.title = `${current?.label ?? 'YieldSense'} · YieldSense AI`;
  }, [current]);

  return (
    <TooltipProvider>
      <div className={s.app}>
        <aside className={clsx(s.sidebar, collapsed && s.collapsed)} aria-label="Sidebar" data-tour="sidebar">
          <Brand />
          <SidebarNav collapsed={collapsed} />
          <div className={s.sidebarFoot}>
            <FooterNav collapsed={collapsed} />
            <button
              type="button"
              className={s.navItem}
              onClick={toggleCollapsed}
              style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer', font: 'inherit' }}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronsRight size={18} aria-hidden="true" />
              ) : (
                <ChevronsLeft size={18} aria-hidden="true" />
              )}
              <span className={s.navLabel}>Collapse</span>
            </button>
          </div>
        </aside>

        <Drawer open={mobileOpen} onOpenChange={setMobileOpen} title="YieldSense AI" side="left">
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <FooterNav onNavigate={() => setMobileOpen(false)} />
        </Drawer>

        <div className={s.main}>
          {offlineDemo && <OfflineDemoBanner />}
          {!online && (
            <div style={{ padding: 'var(--space-2) var(--gutter)' }}>
              <Banner tone="warning">
                <span style={{ display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <WifiOff size={16} aria-hidden="true" /> You are offline. Showing the last loaded data; requests retry
                  when you reconnect.
                </span>
              </Banner>
            </div>
          )}
          <header className={s.topbar}>
            <div className={s.topbarLeft}>
              <IconButton
                icon={mobileOpen ? X : Menu}
                label="Open navigation"
                className={s.menuBtn}
                onClick={() => setMobileOpen(true)}
              />
              <div className={s.crumbsWrap} style={{ minWidth: 0 }}>
                <Breadcrumbs items={[{ label: group?.label ?? 'Account' }, { label: current?.label ?? 'Page' }]} />
              </div>
              <ContextSwitcher />
            </div>
            <div className={s.topbarRight}>
              <button
                type="button"
                className={s.search}
                onClick={() => setPaletteOpen(true)}
                title="Search (Ctrl+K)"
                data-tour="search"
              >
                <Search size={15} aria-hidden="true" />
                <span className={s.searchText}>Search…</span>
                <Kbd>{isMac ? '⌘' : 'Ctrl'} K</Kbd>
              </button>
              <SyncStatus />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>

          <main id="main" className={s.content}>
            <Suspense fallback={<LoadingState />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        {user && <ProductTour username={user.username} />}
      </div>
    </TooltipProvider>
  );
}
