import React from 'react';
import { clsx } from 'clsx';

export type StatusType =
  | 'active'
  | 'inactive'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'pending'
  | 'draft';

interface StatusBadgeProps {
  status: StatusType | string;
  label?: string;
  className?: string;
  dot?: boolean;
}

const statusStyles: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
  completed: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
  scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200/90',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200/90',
  pending: 'bg-amber-50 text-amber-800 border-amber-200/90',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200/90',
  inactive: 'bg-rose-50 text-rose-700 border-rose-200/90',
  rescheduled: 'bg-violet-50 text-violet-700 border-violet-200/90',
};

const dotStyles: Record<string, string> = {
  confirmed: 'bg-emerald-500',
  completed: 'bg-slate-400',
  active: 'bg-emerald-500',
  scheduled: 'bg-indigo-500',
  in_progress: 'bg-sky-500 animate-pulse',
  pending: 'bg-amber-500',
  draft: 'bg-slate-400',
  cancelled: 'bg-rose-500',
  inactive: 'bg-rose-500',
  rescheduled: 'bg-violet-500',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className,
  dot = false,
}) => {
  const normalized = status.toLowerCase();
  const style =
    statusStyles[normalized] ||
    'bg-slate-100 text-slate-700 border-slate-200';
  const dotColor = dotStyles[normalized] || 'bg-slate-400';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize transition-colors duration-200',
        style,
        className
      )}
    >
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dotColor)} />}
      {label || status.replace('_', ' ')}
    </span>
  );
};
