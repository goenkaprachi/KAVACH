import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { COMMON_TIMEZONES } from '../lib/utils';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  isBefore, 
  isAfter,
  startOfToday
} from 'date-fns';
import { 
  Clock, 
  Video, 
  Phone, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  Globe, 
  User, 
  Mail, 
  Sparkles,
  Shield,
  CheckCircle2,
  Calendar as CalendarIcon
} from 'lucide-react';

export const EmbedBookingPage: React.FC = () => {
  const { username, slug } = useParams<{ username: string; slug: string }>();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [selectedTz, setSelectedTz] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  );
  const today = startOfToday();

  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [answerValues, setAnswerValues] = useState<Record<string, string>>({});
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  // 1. Fetch Event Type
  const { data: eventType, isLoading: loadingEvent } = useQuery({
    queryKey: ['embed-event-type', username, slug],
    queryFn: async () => (await api.get(`/event-types/${username}/${slug}/public`)).data,
    enabled: !!username && !!slug,
  });

  const isAttendeeChoice = eventType?.location_type === 'attendee_choice';
  const allowedLocations = eventType?.allowed_locations || [];
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [attendeePhone, setAttendeePhone] = useState<string>('');

  useEffect(() => {
    if (allowedLocations.length > 0) {
      if (!selectedLocation || !allowedLocations.some((l: any) => l.type === selectedLocation)) {
        setSelectedLocation(allowedLocations[0].type);
      }
    }
  }, [allowedLocations, selectedLocation]);

  // 2. Fetch slots
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const { data: slots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['embed-slots', username, slug, selectedDateStr, selectedTz],
    queryFn: async () => {
      const res = await api.get(`/event-types/${username}/${slug}/slots`, {
        params: { date: selectedDateStr, tz: selectedTz },
      });
      return res.data;
    },
    enabled: !!eventType,
  });

  // 3. Create Booking Mutation
  const bookMutation = useMutation({
    mutationFn: async (payload: any) => (await api.post('/bookings', payload)).data,
    onSuccess: (bookingData, variables) => {
      setConfirmedBooking(bookingData);
      // Notify parent frame (Embed Widget API)
      try {
        window.parent.postMessage(
          {
            event: 'kavach:booking_confirmed',
            booking_id: bookingData.id,
            booking_reference: bookingData.booking_reference,
            start_time: bookingData.start_time,
            title: bookingData.title,
            invitee_name: variables.invitee_name,
            invitee_email: variables.invitee_email,
          },
          '*'
        );
      } catch (e) {
        console.warn('PostMessage error:', e);
      }
    },
    onError: (err: any) => {
      setBookingError(err.response?.data?.detail || 'Failed to schedule. Please try another time.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !eventType) return;
    setBookingError(null);

    const custom_answers: Record<string, any> = { ...answerValues };
    if (selectedLocation === 'phone' && attendeePhone.trim()) {
      custom_answers['Contact No.'] = attendeePhone.trim();
    }

    bookMutation.mutate({
      event_type_id: eventType.id,
      start_time: selectedSlot.start_time,
      invitee_name: inviteeName,
      invitee_email: inviteeEmail,
      invitee_timezone: selectedTz,
      custom_answers,
      location_choice: selectedLocation || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const maxAdvanceDays = eventType?.max_days_in_advance ?? 30;
    const maxAdvanceDate = addDays(today, maxAdvanceDays);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const isPast = isBefore(cloneDay, today);
        const isBeyondAdvance = isAfter(cloneDay, maxAdvanceDate);
        const isSelected = isSameDay(cloneDay, selectedDate);
        const isCurrentMonth = isSameMonth(cloneDay, monthStart);
        const isDisabled = isPast || !isCurrentMonth || isBeyondAdvance;

        days.push(
          <button
            key={day.toString()}
            disabled={isDisabled}
            onClick={() => {
              setSelectedDate(cloneDay);
              setSelectedSlot(null);
            }}
            className={`h-8 w-8 mx-auto rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
              isSelected
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-sm'
                : isDisabled
                ? 'text-slate-300 cursor-not-allowed'
                : 'text-slate-700 hover:bg-cyan-50 hover:text-cyan-700'
            }`}
          >
            {format(day, 'd')}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7 py-0.5">
          {days}
        </div>
      );
      days = [];
    }
    return <div>{rows}</div>;
  };

  if (loadingEvent) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="h-7 w-7 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!eventType) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        Event not available.
      </div>
    );
  }

  if (confirmedBooking) {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto animate-in fade-in zoom-in-95">
        <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">You are Scheduled!</h2>
        <p className="text-xs text-slate-500">
          A calendar invitation with meeting details has been sent to <strong>{inviteeEmail}</strong>.
        </p>
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <div className="font-semibold text-slate-800">{eventType.title}</div>
          <div className="text-slate-500">
            {format(new Date(confirmedBooking.start_time), 'EEEE, MMMM d, yyyy')} at{' '}
            {format(new Date(confirmedBooking.start_time), 'h:mm a')}
          </div>
        </div>
        {confirmedBooking.meeting_join_url && (
          <a
            href={confirmedBooking.meeting_join_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 text-white rounded-xl text-xs font-semibold shadow-sm"
          >
            Join Meeting Directly
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="w-full bg-white text-slate-900 p-4 sm:p-6">
      {/* Header Info */}
      <div className="pb-4 mb-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {eventType.owner_name}
          </span>
          <h1 className="text-lg font-bold text-slate-900">{eventType.title}</h1>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1 font-medium">
              <Clock className="h-3.5 w-3.5 text-cyan-600" />
              <span>{eventType.duration_minutes}m</span>
            </span>
            <span className="flex items-center gap-1 font-medium">
              <Video className="h-3.5 w-3.5 text-blue-600" />
              <span>{isAttendeeChoice ? 'Attendee Choice' : 'Online Call'}</span>
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 block">Timezone</span>
          <span className="text-xs font-semibold text-slate-700">{selectedTz}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Calendar Picker */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 pb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {renderCells()}
        </div>

        {/* Time Slots & Form */}
        <div>
          {!selectedSlot ? (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-800 block">
                Available Times for {format(selectedDate, 'EEE, MMM d')}
              </span>

              {loadingSlots ? (
                <div className="py-8 flex justify-center">
                  <div className="h-6 w-6 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : slots.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No slots available on this date. Please pick another day.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {slots.map((s: any) => (
                    <button
                      key={s.start_time}
                      onClick={() => setSelectedSlot(s)}
                      className="py-2 px-3 text-xs font-semibold text-cyan-700 bg-cyan-50/60 hover:bg-cyan-600 hover:text-white border border-cyan-200/60 rounded-xl transition-all"
                    >
                      {s.formatted_time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800">
                  {format(selectedDate, 'MMM d')} at {selectedSlot.formatted_time}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700"
                >
                  Change time
                </button>
              </div>

              {bookingError && (
                <div className="p-2 bg-red-50 text-red-600 rounded-lg text-xs">
                  {bookingError}
                </div>
              )}

              {/* Attendee Platform Choice */}
              {isAttendeeChoice && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Meeting Location
                  </label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    {allowedLocations.map((loc: any) => (
                      <option key={loc.type} value={loc.type}>{loc.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedLocation === 'phone' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Your Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+91..."
                    value={attendeePhone}
                    onChange={(e) => setAttendeePhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={inviteeName}
                  onChange={(e) => setInviteeName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Your Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="john@example.com"
                  value={inviteeEmail}
                  onChange={(e) => setInviteeEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={bookMutation.isPending}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50 transition-all"
              >
                {bookMutation.isPending ? 'Scheduling...' : 'Confirm Meeting'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
