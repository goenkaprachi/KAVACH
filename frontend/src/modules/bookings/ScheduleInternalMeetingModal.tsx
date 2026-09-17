import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { format, addDays } from 'date-fns';
import {
  X,
  Calendar,
  Clock,
  Video,
  Users,
  Building,
  Mail,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Sparkles,
  Phone,
  MapPin,
  ExternalLink,
} from 'lucide-react';

interface ScheduleInternalMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ScheduleInternalMeetingModal: React.FC<ScheduleInternalMeetingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuthStore();

  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [meetingTime, setMeetingTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [provider, setProvider] = useState<'jitsi' | 'google_meet' | 'in_person' | 'phone' | 'custom'>('jitsi');
  const [locationDetail, setLocationDetail] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedColleagueIds, setSelectedColleagueIds] = useState<string[]>([]);
  const [guestEmailInput, setGuestEmailInput] = useState('');
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch employees directory
  const { data: employees = [] } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: async () => {
      const res = await api.get('/admin/employees');
      return res.data;
    },
    enabled: isOpen,
  });

  // Fetch current user profile to verify Google account connection
  const { data: profile } = useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    enabled: isOpen,
  });

  const isGoogleConnected = Boolean(profile?.google_email || profile?.google_meet_url);
  const myGoogleMeetUrl = profile?.google_meet_url;

  // Schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/bookings/internal', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings-all'] });
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
      if (onSuccess) onSuccess();
      handleClose();
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.detail || 'Failed to schedule internal meeting.');
    },
  });

  const handleClose = () => {
    setTitle('');
    setNotes('');
    setSelectedColleagueIds([]);
    setGuestEmails([]);
    setGuestEmailInput('');
    setErrorMessage(null);
    onClose();
  };

  const handleAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = guestEmailInput.trim().toLowerCase();
    if (!clean) return;
    if (guestEmails.includes(clean)) {
      setGuestEmailInput('');
      return;
    }
    setGuestEmails([...guestEmails, clean]);
    setGuestEmailInput('');
  };

  const handleRemoveGuest = (emailToRemove: string) => {
    setGuestEmails(guestEmails.filter((e) => e !== emailToRemove));
  };

  const toggleColleague = (id: string) => {
    if (selectedColleagueIds.includes(id)) {
      setSelectedColleagueIds(selectedColleagueIds.filter((item) => item !== id));
    } else {
      setSelectedColleagueIds([...selectedColleagueIds, id]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Please provide a meeting title.');
      return;
    }
    if (selectedColleagueIds.length === 0 && guestEmails.length === 0) {
      setErrorMessage('Please select at least one colleague or invitee.');
      return;
    }

    const startDateTime = new Date(`${meetingDate}T${meetingTime}:00`);

    scheduleMutation.mutate({
      title: title.trim(),
      start_time: startDateTime.toISOString(),
      duration_minutes: durationMinutes,
      colleague_ids: selectedColleagueIds,
      guest_emails: guestEmails,
      meeting_provider: provider,
      location_detail: locationDetail.trim() || null,
      notes: notes.trim() || null,
    });
  };

  if (!isOpen) return null;

  // Filter out current user from colleagues list
  const availableColleagues = employees.filter((e: any) => e.id !== currentUser?.id && e.status === 'active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Schedule Internal Meeting</h2>
              <p className="text-xs text-slate-500">Sync with colleagues and dispatch calendar invitations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Meeting Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Architecture Sprint Planning or 1:1 Sync"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 font-medium text-slate-900"
            />
          </div>

          {/* Colleague Multi-Select */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Select Colleagues ({selectedColleagueIds.length} selected)
            </label>
            <div className="p-2 border border-slate-200 rounded-xl bg-slate-50 max-h-36 overflow-y-auto space-y-1">
              {availableColleagues.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-2">No other active employees found.</p>
              ) : (
                availableColleagues.map((emp: any) => {
                  const selected = selectedColleagueIds.includes(emp.id);
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => toggleColleague(emp.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                        selected
                          ? 'bg-cyan-100/70 border border-cyan-300 text-cyan-900'
                          : 'hover:bg-white border border-transparent text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-sky-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{emp.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{emp.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {emp.department && (
                          <span className="text-[10px] bg-slate-200/80 px-2 py-0.5 rounded-full text-slate-600 font-medium hidden sm:inline">
                            {emp.department}
                          </span>
                        )}
                        {selected ? (
                          <Check className="h-4 w-4 text-cyan-700 shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded border border-slate-300 bg-white" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* External Guests */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Invite External Guests (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={guestEmailInput}
                onChange={(e) => setGuestEmailInput(e.target.value)}
                placeholder="guest@example.com"
                className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleAddGuest}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors shrink-0"
              >
                + Add Guest
              </button>
            </div>
            {guestEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {guestEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuest(email)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Date & Time & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
              <input
                type="date"
                required
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                required
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Duration</label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 text-slate-700 font-semibold"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
            </div>
          </div>

          {/* Platform / Provider */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Meeting Platform / Provider
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setProvider('google_meet')}
                className={`p-3 rounded-xl border text-left transition-all relative ${
                  provider === 'google_meet'
                    ? 'border-indigo-500 bg-indigo-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-900">Google Meet</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {myGoogleMeetUrl ? (
                    <span className="text-emerald-700 font-semibold">● Verified Link Ready</span>
                  ) : isGoogleConnected ? (
                    <span className="text-indigo-700 font-semibold">● Google Linked</span>
                  ) : (
                    'Real Google Meet Room'
                  )}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('jitsi')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  provider === 'jitsi'
                    ? 'border-cyan-500 bg-cyan-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-cyan-600" />
                  <span className="text-xs font-bold text-slate-900">Jitsi Meet</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Zero-setup Web Video</p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('in_person')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  provider === 'in_person'
                    ? 'border-cyan-500 bg-cyan-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-cyan-600" />
                  <span className="text-xs font-bold text-slate-900">In Person</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Physical Office Room</p>
              </button>
            </div>
          </div>

          {provider === 'google_meet' && (
            <div>
              {myGoogleMeetUrl ? (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950">
                  <Video className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-900">Google Meet Active</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Ready
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-700 font-mono truncate mt-0.5">{myGoogleMeetUrl}</p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Your Google Meet Link</span>
                    </label>
                    <a
                      href="https://meet.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                    >
                      <span>Get link at meet.google.com</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <input
                    type="url"
                    value={locationDetail}
                    onChange={(e) => setLocationDetail(e.target.value)}
                    placeholder="https://meet.google.com/xxx-yyyy-zzz"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900 placeholder:text-slate-400"
                  />
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Paste your permanent Google Meet link (open meet.google.com &rarr; "New meeting" &rarr; "Create a meeting for later"). It will be automatically saved to your profile.
                  </p>
                </div>
              )}
            </div>
          )}

          {(provider === 'in_person' || provider === 'phone' || provider === 'custom') && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Room Name or Location Details
              </label>
              <input
                type="text"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder="e.g. Conference Room 3B (2nd Floor)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              />
            </div>
          )}

          {/* Agenda / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Agenda & Meeting Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Briefly outline topics or discussion points..."
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 resize-none font-medium text-slate-800"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduleMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>{scheduleMutation.isPending ? 'Scheduling...' : 'Schedule & Send Invites'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
