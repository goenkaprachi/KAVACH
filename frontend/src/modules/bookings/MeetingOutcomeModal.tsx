import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { format, addDays } from 'date-fns';
import {
  X,
  FileText,
  CheckCircle2,
  Calendar,
  Clock,
  AlertCircle,
  BellRing,
  Flag,
  ListTodo,
  Tag,
  Save,
  Check,
  Sparkles,
} from 'lucide-react';

interface MeetingOutcomeModalProps {
  booking: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const OUTCOME_OPTIONS = [
  {
    value: 'follow_up_needed',
    label: 'Follow-up Required',
    desc: 'Further discussion or task execution is required',
    autoFollowup: true,
    color: 'bg-amber-50 text-amber-700 border-amber-300',
  },
  {
    value: 'action_items_pending',
    label: 'Action Items Pending',
    desc: 'Tasks were assigned and need tracking',
    autoFollowup: true,
    color: 'bg-sky-50 text-sky-700 border-sky-300',
  },
  {
    value: 'decision_made',
    label: 'Decision Made / Resolved',
    desc: 'Goal achieved and conclusions reached',
    autoFollowup: false,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  },
  {
    value: 'deal_closed',
    label: 'Agreement Reached / Deal Closed',
    desc: 'Commercial or partnership agreement finalized',
    autoFollowup: false,
    color: 'bg-purple-50 text-purple-700 border-purple-300',
  },
  {
    value: 'info_shared',
    label: 'Status Sync / Info Shared',
    desc: 'Regular sync or informative update completed',
    autoFollowup: false,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-300',
  },
  {
    value: 'no_show',
    label: 'No Show / Attendee Absent',
    desc: 'One or more parties did not attend',
    autoFollowup: true,
    color: 'bg-rose-50 text-rose-700 border-rose-300',
  },
  {
    value: 'other',
    label: 'Other',
    desc: 'Custom outcome or general conclusion',
    autoFollowup: false,
    color: 'bg-slate-50 text-slate-700 border-slate-300',
  },
];

export const MeetingOutcomeModal: React.FC<MeetingOutcomeModalProps> = ({
  booking,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();

  const [outcome, setOutcome] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [followupRequired, setFollowupRequired] = useState(false);
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('10:00');
  const [followupNotes, setFollowupNotes] = useState('');
  const [followupPriority, setFollowupPriority] = useState('medium');
  const [followupStatus, setFollowupStatus] = useState('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (booking) {
      setOutcome(booking.meeting_outcome || '');
      setMeetingNotes(booking.meeting_notes || '');
      setFollowupRequired(Boolean(booking.followup_required));
      setFollowupNotes(booking.followup_notes || '');
      setFollowupPriority(booking.followup_priority || 'medium');
      setFollowupStatus(booking.followup_status || 'pending');

      if (booking.followup_date) {
        const dt = new Date(booking.followup_date);
        setFollowupDate(format(dt, 'yyyy-MM-dd'));
        setFollowupTime(format(dt, 'HH:mm'));
      } else {
        // Default follow-up date to 3 business days from today
        const defaultDate = addDays(new Date(), 3);
        setFollowupDate(format(defaultDate, 'yyyy-MM-dd'));
        setFollowupTime('10:00');
      }
      setErrorMsg(null);
    }
  }, [booking, isOpen]);

  const handleOutcomeChange = (newOutcome: string) => {
    setOutcome(newOutcome);
    const opt = OUTCOME_OPTIONS.find((o) => o.value === newOutcome);
    if (opt?.autoFollowup && !followupRequired) {
      setFollowupRequired(true);
    }
  };

  const insertBullet = () => {
    setMeetingNotes((prev) => (prev ? `${prev}
• ` : '• '));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let combinedIsoDate = null;
      if (followupRequired && followupDate) {
        const timePart = followupTime || '10:00';
        combinedIsoDate = new Date(`${followupDate}T${timePart}:00`).toISOString();
      }

      const payload = {
        meeting_outcome: outcome || null,
        meeting_notes: meetingNotes.trim() || null,
        followup_required: followupRequired,
        followup_date: combinedIsoDate,
        followup_notes: followupNotes.trim() || null,
        followup_priority: followupPriority,
        followup_status: followupStatus,
      };

      const res = await api.patch(`/bookings/${booking.id}/outcome`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings-all'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['reminders-list'] });
      queryClient.invalidateQueries({ queryKey: ['reminders-dashboard'] });
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail || 'Failed to save meeting outcome and notes.');
    },
  });

  if (!isOpen || !booking) return null;

  const attendee = booking.invitees?.[0];
  const displayTitle = booking.title || booking.event_type_title || 'Meeting';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200/90 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-cyan-50/50 to-sky-50/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Meeting Outcome & Notes</h2>
              <p className="text-xs text-slate-500 truncate max-w-md">
                {displayTitle} {attendee ? `• with ${attendee.name}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-900">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Outcome Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-cyan-600" />
              <span>Meeting Outcome</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OUTCOME_OPTIONS.map((opt) => {
                const isSelected = outcome === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleOutcomeChange(opt.value)}
                    className={`p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-50/60 shadow-xs ring-1 ring-cyan-500/30'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-cyan-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Free-text Meeting Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-cyan-600" />
                <span>Meeting Notes (Free Text)</span>
              </label>
              <button
                type="button"
                onClick={insertBullet}
                className="text-[11px] font-semibold text-cyan-700 hover:text-cyan-800 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>+ Add Bullet</span>
              </button>
            </div>
            <textarea
              rows={5}
              placeholder="Record discussion points, key insights, client feedback, action items, or general meeting recap..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white resize-y leading-relaxed"
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">
              Free-text notes are saved to the meeting audit record and accessible to authorized team members.
            </p>
          </div>

          {/* 3. Follow-up Reminders Section (Derived from Outcome) */}
          <div className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/70 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                  <BellRing className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Follow-up Reminder</h3>
                  <p className="text-[11px] text-slate-500">
                    Schedule a reminder if subsequent action or check-in is required
                  </p>
                </div>
              </div>

              {/* Toggle switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={followupRequired}
                  onChange={(e) => setFollowupRequired(e.target.checked)}
                />
                <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
              </label>
            </div>

            {followupRequired && (
              <div className="pt-3 border-t border-slate-200 space-y-4 animate-in fade-in-50 duration-150">
                {/* Date & Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">Due Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="date"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        value={followupDate}
                        onChange={(e) => setFollowupDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">Due Time</label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="time"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        value={followupTime}
                        onChange={(e) => setFollowupTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Priority & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">Priority Level</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      value={followupPriority}
                      onChange={(e) => setFollowupPriority(e.target.value)}
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent Priority</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 mb-1 block">Reminder Status</label>
                    <select
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      value={followupStatus}
                      onChange={(e) => setFollowupStatus(e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </div>
                </div>

                {/* Action Items / Follow-up Checklist */}
                <div>
                  <label className="text-[11px] font-bold text-slate-700 mb-1 block flex items-center gap-1.5">
                    <ListTodo className="h-3.5 w-3.5 text-cyan-600" />
                    <span>Follow-up Action Items</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Specify action items (e.g., Send revised proposal, request NDA countersign, schedule tech review)..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                    value={followupNotes}
                    onChange={(e) => setFollowupNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-bold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Save className="h-4 w-4" />
            <span>{saveMutation.isPending ? 'Saving...' : 'Save Notes & Outcome'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
