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
import x from '../../pages/app/extras.module.css';

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
          className={`${clsx(ui.btn, ui.iconBtn, ui.ghost)} ${x.rel}`}
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          title="Notifications"
          data-notification-bell
        >
          <Bell size={17} aria-hidden="true" />
          {unread > 0 && (
            <span aria-hidden="true" className={x.bellBadge}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      }
    >
      <div className={x.bellPanel}>
        <div className={x.spread}>
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
          <p className={x.mutedP}>Notifications couldn’t be loaded.</p>
        ) : q.data.items.length === 0 ? (
          <p className={x.mutedP}>You’re all caught up.</p>
        ) : (
          <ul className={x.listStack}>
            {q.data.items.map(n => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={`${x.bellItem} ${n.read ? '' : x.bellItemUnread}`}
                >
                  <span className={x.rowSm}>
                    {!n.read && <span className="sr-only">Unread: </span>}
                    <Badge tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>{n.category}</Badge>
                    <span className={x.tinyMuted}>{timeAgo(n.created_at)}</span>
                  </span>
                  <span className={`${x.bellTitle} ${n.read ? '' : x.bellTitleUnread}`}>{n.title}</span>
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
