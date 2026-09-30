import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsApi } from '../../api/endpoints';
import type { Notification } from '../../api/types';
import { useMarkAllNotificationsRead, useMarkNotificationRead } from '../../hooks/queries';
import { useGlobalFilters } from '../../store/filters';
import { Badge, Button, Popover, Skeleton } from '../ui';
import ui from '../ui/ui.module.css';
import { SEVERITY_TONE, timeAgo } from '../../lib/notifications';

/** Top-bar bell: unread count, the five latest notifications, mark read, and a link to the full list. */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { filters } = useGlobalFilters();
  // Passing the context lets the server raise alerts for it (deduplicated); the list itself isn't filtered.
  const ctx = { region: filters.region || undefined, crop: filters.crop || undefined };
  const q = useQuery({
    queryKey: ['notifications', 'bell', ctx],
    queryFn: () => notificationsApi.list({ ...ctx, page: 1, page_size: 5 }),
    refetchInterval: 60_000,
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const unread = q.data?.unread_count ?? 0;

  const openItem = (n: Notification) => {
    if (!n.read) markRead.mutate({ id: n.id, read: true });
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          className={clsx(ui.btn, ui.iconBtn, ui.ghost)}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          title="Notifications"
          data-notification-bell
          style={{ position: 'relative' }}
        >
          <Bell size={17} aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 8,
                background: 'var(--danger)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                lineHeight: '16px',
                textAlign: 'center',
              }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      }
    >
      <div style={{ width: 'min(340px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Notifications</strong>
          <Button
            size="sm"
            variant="ghost"
            icon={CheckCheck}
            disabled={!unread}
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        </div>
        {q.isPending ? (
          <Skeleton height={120} />
        ) : q.isError ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>Notifications couldn’t be loaded.</p>
        ) : q.data.items.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>You’re all caught up.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {q.data.items.map(n => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: n.read ? 'transparent' : 'var(--surface-2)',
                    border: 0,
                    borderRadius: 'var(--radius-sm)',
                    padding: 8,
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {!n.read && <span className="sr-only">Unread: </span>}
                    <Badge tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>{n.category}</Badge>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{timeAgo(n.created_at)}</span>
                  </span>
                  <span style={{ display: 'block', fontWeight: n.read ? 400 : 600, marginTop: 2 }}>{n.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          onClick={() => {
            setOpen(false);
            navigate('/app/notifications');
          }}
        >
          View all notifications
        </Button>
      </div>
    </Popover>
  );
}
