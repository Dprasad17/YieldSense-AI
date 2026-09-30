/**
 * YieldSense UI primitives. Styled with tokens only (ui.module.css); Radix for accessible behaviour.
 */
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import * as RadixTabs from '@radix-ui/react-tabs';
import * as RadixSwitch from '@radix-ui/react-switch';
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import * as RadixPopover from '@radix-ui/react-popover';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Info,
  Inbox,
  Lightbulb,
  X,
  type LucideIcon,
} from 'lucide-react';
import { formatCount, formatDeltaPercent, formatIndex, formatRange } from '../../lib/format';
import { usePreferences } from '../../store/preferences';
import { formatYield } from '../../lib/format';
import s from './ui.module.css';

// ---------------------------------------------------------------- Button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(s.btn, s[variant], size !== 'md' && s[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={s.spinner} aria-hidden="true" />
      ) : Icon ? (
        <Icon size={16} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(s.btn, s.iconBtn, s[variant], size === 'sm' && s.sm, className)}
      {...rest}
    >
      <Icon size={size === 'sm' ? 15 : 17} aria-hidden="true" />
    </button>
  );
});

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  children,
  icon: Icon,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Link to={to} className={clsx(s.btn, s[variant], size !== 'md' && s[size])}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- Card

export function Card({
  children,
  className,
  padded = true,
  as: Tag = 'section',
  ...rest
}: { children: ReactNode; className?: string; padded?: boolean; as?: 'section' | 'div' | 'article' } & Record<
  string,
  unknown
>) {
  return (
    <Tag className={clsx(s.card, padded && s.cardPad, className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  info,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  info?: string;
}) {
  return (
    <header className={s.cardHeader}>
      <div style={{ minWidth: 0 }}>
        <h2 className={s.cardTitle} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {title}
          {info && <InfoTip text={info} />}
        </h2>
        {subtitle && <p className={s.cardSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.cardActions}>{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------- Badge / status

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'model';
const toneClass: Record<Tone, string> = {
  neutral: s.neutral,
  success: s.success,
  warning: s.warning,
  danger: s.dangerTone,
  info: s.info,
  model: s.model,
};

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  title,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={clsx(s.badge, toneClass[tone])} title={title}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

const dotColor: Record<Tone, string> = {
  neutral: 'var(--muted)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
  model: 'var(--data-model)',
};

export function StatusDot({ tone = 'neutral', label }: { tone?: Tone; label?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-sm)',
        color: 'var(--ink)',
      }}
    >
      <span className={s.dot} style={{ background: dotColor[tone] }} aria-hidden="true" />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- Tooltip

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={200} skipDelayDuration={100}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className={s.tooltip} side={side} sideOffset={6}>
          {content}
          <RadixTooltip.Arrow className={s.tooltipArrow} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export function InfoTip({ text, label = 'More information' }: { text: ReactNode; label?: string }) {
  return (
    <Tooltip content={text}>
      <button type="button" className={s.infoTrigger} aria-label={label}>
        <Info size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------- Stat card

export interface StatCardProps {
  label: string;
  value: string;
  unit?: string;
  /** Change in percent vs. a previous period. */
  delta?: number | null;
  deltaLabel?: string;
  /** Scope/statistic, e.g. "Global mean · 28,242 records". */
  subtitle?: ReactNode;
  info?: string;
  icon?: LucideIcon;
  accent?: string;
  footer?: ReactNode;
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  subtitle,
  info,
  icon: Icon,
  accent = 'var(--primary)',
  footer,
}: StatCardProps) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card padded={false} className={s.stat}>
      <div className={s.statLabel}>
        {Icon && <Icon size={16} color={accent} aria-hidden="true" />}
        {label}
        {info && <InfoTip text={info} label={`About ${label}`} />}
      </div>
      <div className={s.statValue}>
        {value}
        {unit && <span className={s.statUnit}>{unit}</span>}
      </div>
      <div className={s.statFoot}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {delta != null && (
            <span
              className={clsx(s.num, up ? s.deltaUp : s.deltaDown)}
              style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 2 }}
            >
              {up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
              {formatDeltaPercent(delta)}
              {deltaLabel && <span className={s.statSub}>&nbsp;{deltaLabel}</span>}
            </span>
          )}
          {subtitle && <span className={s.statSub}>{subtitle}</span>}
        </div>
        {footer}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Form controls

export function FormField({
  label,
  hint,
  error,
  children,
  htmlFor,
  optimal,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  optimal?: string;
}) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : (
        (hint || optimal) && <span className={s.hint}>{optimal ? `Optimal: ${optimal}` : hint}</span>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  suffix?: string;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon: Icon, suffix, invalid, className, ...rest },
  ref,
) {
  return (
    <div className={s.control}>
      {Icon && (
        <span className={s.inputIcon}>
          <Icon size={16} aria-hidden="true" />
        </span>
      )}
      <input
        ref={ref}
        className={clsx(s.input, Icon && s.withIcon, suffix && s.withSuffix, className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {suffix && <span className={s.suffix}>{suffix}</span>}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly (string | { value: string; label: string })[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(s.select, className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
});

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={s.switchRow} htmlFor={id}>
      <RadixSwitch.Root
        id={id}
        className={s.switch}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <RadixSwitch.Thumb className={s.thumb} />
      </RadixSwitch.Root>
      {label}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  label: string;
}) {
  return (
    <div className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={s.segment}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <o.icon size={14} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Tabs

export function Tabs({
  value,
  onValueChange,
  tabs,
  label,
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: { value: string; label: ReactNode; content: ReactNode }[];
  label: string;
}) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      <RadixTabs.List className={s.tabList} aria-label={label}>
        {tabs.map(t => (
          <RadixTabs.Trigger key={t.value} value={t.value} className={s.tab}>
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map(t => (
        <RadixTabs.Content key={t.value} value={t.value} className={s.tabPanel}>
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

// ---------------------------------------------------------------- Dialogs

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={s.overlay} />
        <RadixDialog.Content
          className={clsx(s.modal, wide && s.modalWide)}
          aria-describedby={description ? undefined : undefined}
        >
          <RadixDialog.Title className={s.modalTitle}>{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className={s.modalDesc}>{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children && <div className={s.modalBody}>{children}</div>}
          {footer && <div className={s.modalFooter}>{footer}</div>}
          <RadixDialog.Close asChild>
            <IconButton icon={X} label="Close" size="sm" className={s.modalClose} />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  side = 'right',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  side?: 'left' | 'right';
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={s.overlay} />
        <RadixDialog.Content className={clsx(s.drawer, side === 'left' && s.drawerLeft)}>
          <RadixDialog.Title className={s.modalTitle}>{title}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          <div className={s.modalBody}>{children}</div>
          <RadixDialog.Close asChild>
            <IconButton icon={X} label="Close" size="sm" className={s.modalClose} />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// ---------------------------------------------------------------- Menus / popovers

export const DropdownMenu = RadixMenu.Root;
export const DropdownTrigger = RadixMenu.Trigger;

export function DropdownContent({
  children,
  align = 'end',
}: {
  children: ReactNode;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content className={s.menu} align={align} sideOffset={6}>
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  icon: Icon,
  danger,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: LucideIcon;
  danger?: boolean;
}) {
  return (
    <RadixMenu.Item className={clsx(s.menuItem, danger && s.menuItemDanger)} onSelect={onSelect}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </RadixMenu.Item>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className={s.menuLabel}>{children}</RadixMenu.Label>;
}

export function DropdownSeparator() {
  return <RadixMenu.Separator className={s.menuSep} />;
}

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
}: {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  align?: 'start' | 'end' | 'center';
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className={s.popover} align={align} sideOffset={8}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

// ---------------------------------------------------------------- Feedback

const bannerTone = { info: s.bannerInfo, warning: s.bannerWarning, danger: s.bannerDanger, success: s.bannerSuccess };
const bannerIcon = { info: Info, warning: AlertTriangle, danger: AlertTriangle, success: CheckCircle2 };

export function Banner({
  tone = 'info',
  children,
  action,
}: {
  tone?: keyof typeof bannerTone;
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = bannerIcon[tone];
  return (
    <div className={clsx(s.banner, bannerTone[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return (
    <span className={s.skeleton} style={{ display: 'block', width, height, borderRadius: radius }} aria-hidden="true" />
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <h3 className={s.emptyTitle}>{title}</h3>
      {description && <p style={{ margin: 0, maxWidth: '44ch', fontSize: 'var(--text-md)' }}>{description}</p>}
      {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Progress & ranges

export function ProgressBar({
  value,
  max = 100,
  color = 'var(--primary)',
  label,
}: {
  value: number;
  max?: number;
  color?: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={s.progress}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className={s.progressFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function ProgressRing({
  value,
  max = 100,
  size = 88,
  stroke = 8,
  color = 'var(--primary)',
  label,
  display,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  label: string;
  display?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div
      className={s.ring}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${display ?? Math.round(value)} of ${max}`}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: 'var(--surface-2)' }}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: color, transition: 'stroke-dashoffset var(--duration-slow) var(--ease-out)' }}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className={s.ringValue} style={{ fontSize: size > 70 ? 'var(--text-xl)' : 'var(--text-sm)' }}>
        {display ?? Math.round(value)}
      </span>
    </div>
  );
}

/** A value marker on a scale, with the optimal band highlighted. */
export function RangeBar({
  value,
  min,
  max,
  optimalLow,
  optimalHigh,
  format = (v: number) => formatIndex(v),
  label,
}: {
  value: number;
  min: number;
  max: number;
  optimalLow?: number;
  optimalHigh?: number;
  format?: (v: number) => string;
  label: string;
}) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`;
  const inBand = optimalLow != null && optimalHigh != null && value >= optimalLow && value <= optimalHigh;
  return (
    <div
      role="img"
      aria-label={`${label}: ${format(value)}${optimalLow != null ? `, optimal ${format(optimalLow)}–${format(optimalHigh ?? optimalLow)}` : ''}`}
    >
      <div className={s.rangeBar}>
        {optimalLow != null && optimalHigh != null && (
          <div
            className={s.rangeBand}
            style={{ left: pos(optimalLow), width: `calc(${pos(optimalHigh)} - ${pos(optimalLow)})` }}
          />
        )}
        <div
          className={s.rangeMarker}
          style={{ left: pos(value), background: inBand || optimalLow == null ? 'var(--ink)' : 'var(--warning)' }}
        />
      </div>
      <div className={s.rangeScale}>
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Layout helpers

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={s.kbd}>{children}</kbd>;
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className={s.pageHeader}>
      <div style={{ minWidth: 0 }}>
        <h1 className={s.pageTitle}>{title}</h1>
        {description && <p className={s.pageDesc}>{description}</p>}
        {meta && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
            {meta}
          </div>
        )}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ minWidth: 0 }}>
      <ol className={s.crumbs}>
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${it.label}-${i}`}>
              {it.to && !last ? (
                <Link to={it.to} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {it.label}
                </Link>
              ) : (
                <span className={last ? s.crumbCurrent : undefined} aria-current={last ? 'page' : undefined}>
                  {it.label}
                </span>
              )}
              {!last && <ChevronRight size={14} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function InsightCallout({ children }: { children: ReactNode }) {
  return (
    <p className={s.insight}>
      <Lightbulb size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** "XGBoost · R² 0.95 · RMSE 2,096" */
export function ModelChip({
  name,
  r2,
  rmse,
  to,
}: {
  name: string;
  r2?: number | null;
  rmse?: number | null;
  to?: string;
}) {
  const content = (
    <>
      <Cpu size={13} aria-hidden="true" />
      <span>{name}</span>
      {r2 != null && <span className={s.num}>· R² {formatIndex(r2)}</span>}
      {rmse != null && <span className={s.num}>· RMSE {formatCount(rmse)}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={s.modelChip}>
      {content}
    </Link>
  ) : (
    <span className={s.modelChip}>{content}</span>
  );
}

/** Yield rendered in the user's preferred unit (kg/ha ↔ t/ha). */
export function UnitValue({ kgPerHa, showUnit = true }: { kgPerHa: number | null | undefined; showUnit?: boolean }) {
  const { unit } = usePreferences();
  return (
    <span className={s.num}>
      {formatYield(kgPerHa, unit)}
      {showUnit && kgPerHa != null && (
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-ui)' }}> {unit}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- Table

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  sortValue?: (row: T) => number | string;
  sticky?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  compact,
  sort,
  onSortChange,
  onRowClick,
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  compact?: boolean;
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange?: (s: { key: string; dir: 'asc' | 'desc' }) => void;
  onRowClick?: (row: T) => void;
  maxHeight?: number | string;
}) {
  return (
    <div className={s.tableWrap} style={{ maxHeight }}>
      <table className={clsx(s.table, compact && s.compact)}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map(c => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={clsx(c.align === 'right' && s.alignRight, c.sticky && s.stickyCol)}
                  aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortValue && onSortChange ? (
                    <button
                      type="button"
                      className={s.sortBtn}
                      onClick={() => onSortChange({ key: c.key, dir: active && sort?.dir === 'desc' ? 'asc' : 'desc' })}
                    >
                      {c.header}
                      <span aria-hidden="true">{active ? (sort?.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? e => (e.key === 'Enter' ? onRowClick(row) : undefined) : undefined}
            >
              {columns.map(c => (
                <td
                  key={c.key}
                  className={clsx(c.align === 'right' && clsx(s.alignRight, s.num), c.sticky && s.stickyCol)}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizes,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  pageSizes?: number[];
  onPageSizeChange?: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className={s.pagination}>
      <span className={s.num}>{formatRange(page, pageSize, total)}</span>
      <div className={s.paginationControls}>
        {pageSizes && onPageSizeChange && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            Rows
            <Select
              value={String(pageSize)}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              options={pageSizes.map(String)}
              style={{ width: 76, height: 30 }}
            />
          </label>
        )}
        <IconButton
          icon={ChevronLeft}
          label="Previous page"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <span className={s.num}>
          {formatCount(page)} / {formatCount(pages)}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Next page"
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  );
}

/** Accessible horizontal ranking without a chart library: label, bar, value, optional benchmark marker. */
export function BarList({
  items,
  format,
  color = 'var(--data-vegetation)',
  benchmark,
  benchmarkLabel = 'Average',
  label,
}: {
  items: { label: string; value: number }[];
  format: (v: number) => string;
  color?: string;
  benchmark?: number;
  benchmarkLabel?: string;
  label: string;
}) {
  const max = Math.max(...items.map(i => i.value), benchmark ?? 0) || 1;
  return (
    <div>
      <ul className={s.barList} aria-label={label}>
        {items.map(i => (
          <li key={i.label} className={s.barRow}>
            <span className={s.barLabel}>{i.label}</span>
            <span className={s.barTrack} aria-hidden="true">
              <span className={s.barFill} style={{ width: `${(i.value / max) * 100}%`, background: color }} />
              {benchmark != null && <span className={s.barMark} style={{ left: `${(benchmark / max) * 100}%` }} />}
            </span>
            <span className={s.barValue}>{format(i.value)}</span>
          </li>
        ))}
      </ul>
      {benchmark != null && (
        <p
          style={{
            margin: 'var(--space-3) 0 0',
            fontSize: 'var(--text-xs)',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 2, height: 12, background: 'var(--warning)', display: 'inline-block' }}
          />
          {benchmarkLabel}: {format(benchmark)}
        </p>
      )}
    </div>
  );
}
