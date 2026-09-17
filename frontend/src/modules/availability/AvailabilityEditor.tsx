import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { 
  Clock, 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Check, 
  AlertCircle, 
  Save 
} from 'lucide-react';

const DAYS = [
  { dow: 1, name: 'Monday' },
  { dow: 2, name: 'Tuesday' },
  { dow: 3, name: 'Wednesday' },
  { dow: 4, name: 'Thursday' },
  { dow: 5, name: 'Friday' },
  { dow: 6, name: 'Saturday' },
  { dow: 0, name: 'Sunday' },
];

export const AvailabilityEditor: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [rulesState, setRulesState] = useState<{
    [dow: number]: { enabled: boolean; start: string; end: string };
  }>({
    1: { enabled: true, start: '09:00', end: '17:00' },
    2: { enabled: true, start: '09:00', end: '17:00' },
    3: { enabled: true, start: '09:00', end: '17:00' },
    4: { enabled: true, start: '09:00', end: '17:00' },
    5: { enabled: true, start: '09:00', end: '17:00' },
    6: { enabled: false, start: '09:00', end: '17:00' },
    0: { enabled: false, start: '09:00', end: '17:00' },
  });

  // Overrides state
  const [overrideDate, setOverrideDate] = useState('');
  const [isUnavailable, setIsUnavailable] = useState(true);
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideEnd, setOverrideEnd] = useState('17:00');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['availability-schedules'],
    queryFn: async () => {
      const res = await api.get('/availability/schedules');
      return res.data;
    },
  });

  const activeSchedule = schedules[0];

  useEffect(() => {
    if (activeSchedule && activeSchedule.rules) {
      const nextState: any = {
        1: { enabled: false, start: '09:00', end: '17:00' },
        2: { enabled: false, start: '09:00', end: '17:00' },
        3: { enabled: false, start: '09:00', end: '17:00' },
        4: { enabled: false, start: '09:00', end: '17:00' },
        5: { enabled: false, start: '09:00', end: '17:00' },
        6: { enabled: false, start: '09:00', end: '17:00' },
        0: { enabled: false, start: '09:00', end: '17:00' },
      };

      activeSchedule.rules.forEach((r: any) => {
        nextState[r.day_of_week] = {
          enabled: true,
          start: r.start_time.slice(0, 5),
          end: r.end_time.slice(0, 5),
        };
      });
      setRulesState(nextState);
    }
  }, [activeSchedule]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (activeSchedule) {
        return await api.patch(`/availability/schedules/${activeSchedule.id}`, payload);
      } else {
        return await api.post('/availability/schedules', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-schedules'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    },
  });

  const addOverrideMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!activeSchedule) return;
      return await api.post(`/availability/schedules/${activeSchedule.id}/overrides`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-schedules'] });
      setOverrideDate('');
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (overrideId: string) => {
      if (!activeSchedule) return;
      return await api.delete(`/availability/schedules/${activeSchedule.id}/overrides/${overrideId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-schedules'] });
    },
  });

  const handleToggleDay = (dow: number) => {
    setRulesState((prev) => ({
      ...prev,
      [dow]: {
        ...prev[dow],
        enabled: !prev[dow].enabled,
      },
    }));
  };

  const handleTimeChange = (dow: number, field: 'start' | 'end', val: string) => {
    setRulesState((prev) => ({
      ...prev,
      [dow]: {
        ...prev[dow],
        [field]: val,
      },
    }));
  };

  const handleSaveWeekly = () => {
    const rulesToSave: any[] = [];
    Object.entries(rulesState).forEach(([dowStr, config]) => {
      if (config.enabled) {
        rulesToSave.push({
          day_of_week: Number(dowStr),
          start_time: `${config.start}:00`,
          end_time: `${config.end}:00`,
        });
      }
    });

    updateMutation.mutate({
      name: activeSchedule?.name || 'Working Hours',
      is_default: true,
      rules: rulesToSave,
    });
  };

  const handleAddOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideDate) return;

    addOverrideMutation.mutate({
      override_date: overrideDate,
      is_unavailable: isUnavailable,
      start_time: isUnavailable ? null : `${overrideStart}:00`,
      end_time: isUnavailable ? null : `${overrideEnd}:00`,
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Orion Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Availability</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-cyan-100 text-cyan-700 border border-cyan-200">
                Weekly Schedule
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Set your regular weekly bookable hours and add date-specific holiday overrides
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveWeekly}
          disabled={updateMutation.isPending}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saveSuccess ? (
            <>
              <Check className="h-4 w-4 text-emerald-200" />
              <span>Saved Successfully!</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Schedule'}</span>
            </>
          )}
        </button>
      </div>

      {/* Weekly Schedule Box */}
      <div className="glass-panel border border-slate-200/90 rounded-2xl p-6 shadow-xs">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-cyan-600" />
            <h2 className="font-bold text-slate-900 text-base">Weekly Recurring Hours</h2>
          </div>
        </div>

        <div className="space-y-3">
          {DAYS.map(({ dow, name }) => {
            const rule = rulesState[dow] || { enabled: false, start: '09:00', end: '17:00' };
            return (
              <div
                key={dow}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  rule.enabled
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50 text-slate-400'
                }`}
              >
                <div className="flex items-center space-x-3 w-40">
                  <input
                    type="checkbox"
                    id={`dow-${dow}`}
                    checked={rule.enabled}
                    onChange={() => handleToggleDay(dow)}
                    className="h-4 w-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <label
                    htmlFor={`dow-${dow}`}
                    className={`text-sm font-semibold cursor-pointer select-none ${
                      rule.enabled ? 'text-slate-800' : 'text-slate-400'
                    }`}
                  >
                    {name}
                  </label>
                </div>

                {rule.enabled ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="time"
                      value={rule.start}
                      onChange={(e) => handleTimeChange(dow, 'start', e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                      type="time"
                      value={rule.end}
                      onChange={(e) => handleTimeChange(dow, 'end', e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                ) : (
                  <span className="text-xs font-medium text-slate-400 italic">Unavailable</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Overrides Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center space-x-2">
            <CalendarIcon className="h-5 w-5 text-purple-600" />
            <h2 className="font-bold text-slate-900 text-base">Date Overrides & Holidays</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Add specific dates when you will be out of office or working extra hours
          </p>
        </div>

        {/* Add Override Form */}
        <form onSubmit={handleAddOverride} className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg mb-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Select Date
            </label>
            <input
              type="date"
              required
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Availability
            </label>
            <select
              value={isUnavailable ? 'unavailable' : 'custom'}
              onChange={(e) => setIsUnavailable(e.target.value === 'unavailable')}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="unavailable">Unavailable (All Day Off)</option>
              <option value="custom">Custom Hours</option>
            </select>
          </div>

          {!isUnavailable && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={overrideStart}
                  onChange={(e) => setOverrideStart(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  End
                </label>
                <input
                  type="time"
                  value={overrideEnd}
                  onChange={(e) => setOverrideEnd(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={addOverrideMutation.isPending}
            className="inline-flex items-center space-x-1 bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Override</span>
          </button>
        </form>

        {/* Existing Overrides List */}
        {activeSchedule?.overrides?.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No date overrides configured.</p>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {activeSchedule?.overrides?.map((ov: any) => (
              <div key={ov.id} className="flex justify-between items-center p-3 text-xs bg-white">
                <div className="flex items-center space-x-3">
                  <span className="font-semibold text-slate-800">{ov.override_date}</span>
                  {ov.is_unavailable ? (
                    <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                      All Day Unavailable
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                      {ov.start_time?.slice(0, 5)} - {ov.end_time?.slice(0, 5)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteOverrideMutation.mutate(ov.id)}
                  className="text-slate-400 hover:text-red-600 p-1 rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
