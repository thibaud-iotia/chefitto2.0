import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { initials } from '../domain/logic';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'outline';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
}
export function Button({ variant = 'primary', size = 'md', block, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx(s.btn, s[size], s[variant], block && s.block, className)} {...rest} />;
}

/* ---------- IconButton ---------- */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}
export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} className={cx(s.iconBtn, className)} {...rest}>
      {children}
    </button>
  );
}

/* ---------- Input ---------- */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string | null;
  size?: 'md' | 'lg';
  leftIcon?: ReactNode;
}
export function Input({ label, hint, error, size = 'md', leftIcon, id, className, ...rest }: InputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  return (
    <div className={cx(s.field, className)}>
      {label && (
        <label htmlFor={inputId} className={s.label}>
          {label}
        </label>
      )}
      <div
        className={cx(s.control, error && s.controlError)}
        style={{ height: size === 'lg' ? 'var(--control-lg)' : 'var(--control-md)' }}
      >
        {leftIcon}
        <input id={inputId} aria-invalid={!!error || undefined} aria-describedby={error || hint ? msgId : undefined} {...rest} />
      </div>
      {(error || hint) && (
        <span id={msgId} className={error ? s.error : s.hint} role={error ? 'alert' : undefined}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

/* ---------- Tabs ---------- */
export interface TabItem<V extends string> {
  value: V;
  label: string;
  count?: number;
}
export function Tabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            className={cx(s.tab, on && s.tabOn)}
            onClick={() => onChange(t.value)}
          >
            {t.label}
            {t.count != null && <span className={s.tabCount}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'brand'; children: ReactNode }) {
  return <span className={cx(s.badge, s[`badge-${tone}`])}>{children}</span>;
}

/* ---------- Tag ---------- */
export function Tag({ children, onRemove, removeLabel }: { children: ReactNode; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span className={s.tag}>
      {children}
      {onRemove && (
        <button type="button" className={s.tagRemove} onClick={onRemove} aria-label={removeLabel ?? 'Retirer'}>
          ×
        </button>
      )}
    </span>
  );
}

/* ---------- Avatar ---------- */
const AVATAR = { md: 40, lg: 48, xl: 64 } as const;
export function Avatar({ name, size = 'md', ring }: { name: string; size?: keyof typeof AVATAR; ring?: boolean }) {
  const dim = AVATAR[size];
  return (
    <span className={cx(s.avatar, ring && s.avatarRing)} style={{ width: dim, height: dim, fontSize: dim * 0.36 }} aria-hidden="true">
      {initials(name) || '?'}
    </span>
  );
}

/* ---------- ProgressBar ---------- */
const FILL = { brand: 'var(--grad-brand)', accent: 'var(--grad-accent)' } as const;
export function ProgressBar({ value, tone = 'brand', label }: { value: number; tone?: keyof typeof FILL; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={s.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={s.barFill} style={{ width: `${pct}%`, background: FILL[tone] }} />
    </div>
  );
}

/* ---------- ProgressRing ---------- */
const RING = { brand: ['#FF5A70', '#F5254A'], accent: ['#2FE3A6', '#0BB77C'], amber: ['#FFC24B', '#F5A623'] } as const;
export function ProgressRing({
  value,
  size = 52,
  stroke = 5,
  tone = 'brand',
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: keyof typeof RING;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const gid = `ring-${tone}`;
  const [a, b] = RING[tone];
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} role="img" aria-label={`${Math.round(pct)} % des ingrédients au frigo`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={a} />
            <stop offset="100%" stopColor={b} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out)' }}
        />
      </svg>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: size * 0.26,
          color: 'var(--text-heading)',
        }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* ---------- Chip ---------- */
export function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} className={cx(s.chip, on && s.chipOn)} onClick={onClick}>
      {children}
    </button>
  );
}
