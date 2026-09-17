import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  X,
  User,
  Mail,
  Phone,
  Building,
  Globe,
  FileText,
  Check,
  AlertCircle,
  Save,
  UserCheck,
} from 'lucide-react';

interface EditAttendeeModalProps {
  booking: any | null;
  invitee?: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedBooking: any) => void;
}

const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const extractPhone = (inv: any): string => {
  if (!inv?.custom_answers) return '';
  const answers = inv.custom_answers;
  const phoneKeys = ['contact no.', 'contact number', 'phone', 'phone number', 'mobile', 'mobile number', 'contact'];
  for (const [key, val] of Object.entries(answers)) {
    if (phoneKeys.includes(key.toLowerCase().trim()) && val) {
      return String(val).trim();
    }
  }
  return '';
};

const extractCompany = (inv: any): string => {
  if (!inv?.custom_answers) return '';
  const answers = inv.custom_answers;
  for (const [key, val] of Object.entries(answers)) {
    if (key.toLowerCase().includes('company') && val) {
      return String(val).trim();
    }
  }
  return '';
};

const extractNotes = (inv: any): string => {
  if (!inv?.custom_answers) return '';
  const answers = inv.custom_answers;
  for (const [key, val] of Object.entries(answers)) {
    if ((key.toLowerCase().includes('note') || key.toLowerCase().includes('agenda')) && val) {
      return String(val).trim();
    }
  }
  return '';
};

export const EditAttendeeModal: React.FC<EditAttendeeModalProps> = ({
  booking,
  invitee,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const currentInvitee = invitee || booking?.invitees?.[0];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentInvitee) {
      setName(currentInvitee.name || '');
      setEmail(currentInvitee.email || '');
      setPhone(extractPhone(currentInvitee));
      setCompany(extractCompany(currentInvitee));
      setTimezone(currentInvitee.timezone || 'Asia/Kolkata');
      setNotes(extractNotes(currentInvitee));
    }
    setError(null);
  }, [currentInvitee, isOpen]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!booking?.id) throw new Error('Missing booking reference.');
      const res = await api.patch(`/bookings/${booking.id}/attendee`, {
        invitee_id: currentInvitee?.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        company: company.trim() || null,
        timezone: timezone.trim() || 'UTC',
        notes: notes.trim() || null,
      });
      return res.data;
    },
    onSuccess: (updatedBooking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking-logs', booking?.id] });
      queryClient.invalidateQueries({ queryKey: ['bookings-dashboard'] });
      if (onSuccess) onSuccess(updatedBooking);
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Failed to update attendee details. Please check the fields.');
    },
  });

  if (!isOpen || !booking) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide the attendee name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200/90 text-slate-900 space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-cyan-50 border border-cyan-200/80 text-cyan-600 flex items-center justify-center shadow-xs">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Edit Attendee Details</h3>
              <p className="text-xs text-slate-500">
                Ref: <span className="font-mono font-semibold text-slate-700">{booking.booking_reference || booking.id.slice(0, 8)}</span>
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

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Attendee Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Attendee Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah Connor"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900"
              />
            </div>
          </div>

          {/* Attendee Email */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sarah@example.com"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Email used for meeting reminders, calendar invites, and rescheduling notifications.
            </p>
          </div>

          {/* Contact Number & Company Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Contact Number (Optional)
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Company / Organization
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Cyberdyne Systems"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Attendee Timezone
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900 appearance-none cursor-pointer"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Attendee Notes / Special Requests */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Attendee Notes & Specific Topics
            </label>
            <div className="relative">
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special requests or discussion topics shared by the attendee..."
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium text-slate-900 resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-extrabold bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{updateMutation.isPending ? 'Saving...' : 'Save Attendee Details'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
