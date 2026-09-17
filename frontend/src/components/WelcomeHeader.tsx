import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Quote } from 'lucide-react';
import { useAuthStore } from '../lib/store';

const QUOTES: { text: string; author: string }[] = [
  { text: 'The key is not to prioritize what’s on your schedule, but to schedule your priorities.', author: 'Stephen Covey' },
  { text: 'Until we can manage time, we can manage nothing else.', author: 'Peter Drucker' },
  { text: 'Time is what we want most, but what we use worst.', author: 'William Penn' },
  { text: 'Well begun is half done.', author: 'Aristotle' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Peter Drucker' },
  { text: 'The bad news is time flies. The good news is you’re the pilot.', author: 'Michael Altshuler' },
  { text: 'Small daily improvements are the key to staggering long-term results.', author: 'James Clear' },
  { text: 'It is not enough to be busy. The question is: what are we busy about?', author: 'Henry David Thoreau' },
  { text: 'Amateurs sit and wait for inspiration, the rest of us just get up and go to work.', author: 'Stephen King' },
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
];

const getDayOfYear = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const getGreeting = (hour: number): string => {
  if (hour < 5) return 'Burning the midnight oil';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Working late';
};

export const WelcomeHeader: React.FC = () => {
  const { user } = useAuthStore();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const quote = QUOTES[getDayOfYear(now) % QUOTES.length];
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 px-6 py-6 shadow-sm sm:px-8 sm:py-7">
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xl font-extrabold text-slate-900 sm:text-2xl tracking-tight">
            {getGreeting(now.getHours())}, <span className="bg-gradient-to-r from-amber-700 via-amber-600 to-amber-800 bg-clip-text text-transparent">{firstName}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Here&apos;s what&apos;s happening with your schedule today.
          </p>
        </div>

        <div className="flex flex-col items-start gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 shadow-xs lg:items-end">
          <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">
            {format(now, 'hh:mm:ss a')}
          </span>
          <span className="text-xs font-semibold text-slate-500">{format(now, 'EEEE, MMMM d, yyyy')}</span>
        </div>
      </div>

      <div className="relative mt-5 flex items-start gap-3 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/90 to-amber-100/40 px-4 py-3 shadow-xs">
        <Quote className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <p className="text-sm italic leading-relaxed text-slate-700">
          “{quote.text}” <span className="not-italic font-medium text-slate-500">— {quote.author}</span>
        </p>
      </div>
    </div>
  );
};
