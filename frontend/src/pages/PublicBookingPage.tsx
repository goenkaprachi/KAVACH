import React, { useState, useEffect, useMemo } from 'react';
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
  startOfToday,
  parseISO
} from 'date-fns';
import { 
  Clock, 
  Video, 
  Phone, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Globe, 
  User, 
  Mail, 
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Shield
} from 'lucide-react';

export const PublicBookingPage: React.FC = () => {
  const { username, slug } = useParams<{ username: string; slug: string }>();
  const navigate = useNavigate();

  // Selected date & timezone
  const today = startOfToday();
  const [currentMonth, setCurrentMonth] = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedTz, setSelectedTz] = useState<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  );

  // Selected slot for booking modal
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);

  // Form State
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingError, setBookingError] = useState<string | null>(null);

  // 1. Fetch public event type details
  const { data: eventType, isLoading: loadingEvent, error: eventError } = useQuery({
    queryKey: ['public-event', username, slug],
    queryFn: async () => {
      const res = await api.get(`/event-types/${username}/${slug}/public`);
      return res.data;
    },
  });

  // Admin-configured intake fields (beyond Name/Email), driven by the event
  // type's custom_questions. Attendees fill these in; required/optional is
  // controlled by the admin, not the attendee.
  const answerFields = useMemo(() => {
    const raw = eventType?.custom_questions;
    if (!Array.isArray(raw)) return [] as { key: string; label: string; required: boolean }[];
    return raw
      .map((q: any) => {
        const label = typeof q === 'string' ? q : q.label || q.name || '';
        return {
          key: typeof q === 'object' && q.key ? q.key : label,
          label: label.trim(),
          required: typeof q === 'object' ? !!q.required : false,
        };
      })
      .filter((f) => f.label && !['name', 'email id', 'email'].includes(f.label.toLowerCase()));
  }, [eventType]);

  const [answerValues, setAnswerValues] = useState<Record<string, string>>({});

  // Attendee location choice state
  const isAttendeeChoice = useMemo(() => {
    return (
      eventType?.location_type === 'attendee_choice' ||
      (Array.isArray(eventType?.allowed_locations) && eventType.allowed_locations.length > 1)
    );
  }, [eventType]);

  const allowedLocations = useMemo(() => {
    if (Array.isArray(eventType?.allowed_locations) && eventType.allowed_locations.length > 0) {
      return eventType.allowed_locations;
    }
    if (eventType?.location_type && eventType.location_type !== 'attendee_choice') {
      return [
        {
          type: eventType.location_type,
          label:
            eventType.location_type === 'google_meet'
              ? 'Google Meet'
              : eventType.location_type === 'phone'
              ? 'Phone Call'
              : eventType.location_type === 'in_person'
              ? 'In-Person Meeting'
              : 'Video Call',
          detail: eventType.location_detail,
        },
      ];
    }
    return [
      { type: 'google_meet', label: 'Google Meet' },
      { type: 'phone', label: 'Phone Call', detail: 'Host will call invitee' },
    ];
  }, [eventType]);

  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [attendeePhone, setAttendeePhone] = useState<string>('');

  useEffect(() => {
    if (allowedLocations.length > 0) {
      if (!selectedLocation || !allowedLocations.some((l: any) => l.type === selectedLocation)) {
        setSelectedLocation(allowedLocations[0].type);
      }
    }
  }, [allowedLocations, selectedLocation]);

  // Reset answers whenever the set of configured fields changes (new event type loaded)
  useEffect(() => {
    setAnswerValues({});
  }, [answerFields.length, eventType?.id]);

  // 2. Fetch live computed slots for selected date
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const { data: slots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ['slots', username, slug, selectedDateStr, selectedTz],
    queryFn: async () => {
      const res = await api.get(`/event-types/${username}/${slug}/slots`, {
        params: {
          date: selectedDateStr,
          tz: selectedTz,
        },
      });
      return res.data;
    },
    enabled: !!eventType,
  });

  // 3. Create booking mutation
  const bookMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/bookings', payload);
      return res.data;
    },
    onSuccess: (bookingData, variables) => {
      navigate('/booking-confirmed', {
        state: { 
          booking: bookingData, 
          eventType,
          answers: variables.custom_answers || {},
        },
      });
    },
    onError: (err: any) => {
      setBookingError(err.response?.data?.detail || 'Failed to complete booking. Slot may have been taken.');
    },
  });

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !eventType) return;
    setBookingError(null);

    const missingRequired = answerFields.find(
      (f) => f.required && !(answerValues[f.key] || '').trim()
    );
    if (missingRequired) {
      setBookingError(`"${missingRequired.label}" is required to schedule this meeting.`);
      return;
    }

    const custom_answers: Record<string, any> = {};
    answerFields.forEach((f) => {
      const val = (answerValues[f.key] || '').trim();
      if (val) {
        custom_answers[f.label] = val;
      }
    });

    // If attendee selected phone call, ensure contact phone number is present
    if (selectedLocation === 'phone') {
      const existingPhone =
        custom_answers['Contact No.'] ||
        custom_answers['Contact Number'] ||
        custom_answers['Phone'] ||
        custom_answers['Phone Number'];
      if (!existingPhone && attendeePhone.trim()) {
        custom_answers['Contact No.'] = attendeePhone.trim();
      } else if (!existingPhone && !attendeePhone.trim()) {
        setBookingError('Please provide your phone number so the host can call you at the scheduled time.');
        return;
      }
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

  // Calendar rendering helpers
  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-2 py-3 border-b border-slate-100">
        <span className="text-sm font-bold text-slate-800">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 py-2">
        {days.map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
    );
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
            onClick={() => setSelectedDate(cloneDay)}
            className={`h-9 w-9 mx-auto rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
              isSelected
                ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white shadow-md shadow-cyan-500/25'
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
        <div key={day.toString()} className="grid grid-cols-7 py-1">
          {days}
        </div>
      );
      days = [];
    }
    return <div className="p-2">{rows}</div>;
  };

  if (loadingEvent) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (eventError || !eventType) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Event Not Found</h2>
          <p className="mt-2 text-sm text-slate-500">
            This scheduling link may have been disabled or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col md:flex-row">
        {/* Left Column: Event details */}
        <div className="md:w-5/12 p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50">
          <div className="space-y-4">
            <div className="flex items-center space-x-2.5 pb-1">
              <img
                src="/badge.jpg"
                alt="Kavach Connect"
                className="h-8 w-8 rounded-full object-cover shadow-sm border border-amber-900/20"
              />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Kavach Connect</span>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {eventType.owner_name}
              </span>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">
                {eventType.title}
              </h1>
            </div>

            <div className="space-y-2 text-xs font-semibold text-slate-600">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span>{eventType.duration_minutes} minutes</span>
              </div>
              <div className="flex items-center space-x-2">
                {isAttendeeChoice ? (
                  <>
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    <span>Attendee Choice ({allowedLocations.length} options)</span>
                  </>
                ) : (
                  <>
                    {eventType.location_type === 'phone' ? (
                      <Phone className="h-4 w-4 text-emerald-600" />
                    ) : eventType.location_type === 'in_person' ? (
                      <MapPin className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Video className="h-4 w-4 text-emerald-600" />
                    )}
                    <span>
                      {eventType.location_type === 'jitsi'
                        ? 'Video Call'
                        : eventType.location_type === 'google_meet'
                        ? 'Google Meet'
                        : eventType.location_type === 'zoom'
                        ? 'Zoom Video'
                        : eventType.location_type === 'microsoft_teams'
                        ? 'Microsoft Teams'
                        : eventType.location_type === 'whereby'
                        ? 'Whereby'
                        : eventType.location_type === 'phone'
                        ? 'Phone Call'
                        : eventType.location_type === 'in_person'
                        ? 'In-Person Meeting'
                        : eventType.location_type === 'custom'
                        ? 'Web Link'
                        : eventType.location_type.replace(/_/g, ' ')}
                      {eventType.location_detail && (
                        <span className="font-normal text-slate-500 ml-1.5">
                          ({eventType.location_detail})
                        </span>
                      )}
                    </span>
                  </>
                )}
              </div>

              {(eventType.min_notice_minutes || 0) > 60 && (
                <div className="flex items-center space-x-2 text-slate-500 font-medium">
                  <Shield className="h-4 w-4 text-cyan-600" />
                  <span>
                    Min {eventType.min_notice_minutes >= 1440
                      ? `${Math.round(eventType.min_notice_minutes / 1440)} day(s)`
                      : `${Math.round(eventType.min_notice_minutes / 60)} hour(s)`} notice required
                  </span>
                </div>
              )}

              {/* Booking Distribution Badge */}
              {eventType.booking_type === 'group' && (
                <div className="pt-1">
                  <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg">
                    <span>👥 Group Session (Max {eventType.group_capacity || 10} attendees)</span>
                  </span>
                </div>
              )}
              {eventType.booking_type === 'round_robin' && (
                <div className="pt-1">
                  <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
                    <span>🔄 Team Round-Robin Allocation</span>
                  </span>
                </div>
              )}
              {eventType.booking_type === 'collective' && (
                <div className="pt-1">
                  <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                    <span>👥 Collective Panel Meeting</span>
                  </span>
                </div>
              )}
              {/* Price Badge */}
              {eventType.payment_provider && eventType.payment_provider !== 'none' && eventType.price_amount && (
                <div className="pt-1">
                  <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                    <span>💳 Paid Meeting —{' '}
                      {eventType.currency === 'INR' ? '₹' : eventType.currency === 'USD' ? '$' : eventType.currency === 'EUR' ? '€' : eventType.currency + ' '}
                      {(eventType.price_amount / 100).toFixed(2)}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {eventType.description && (
              <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200 pt-4">
                {eventType.description}
              </p>
            )}

            {/* Timezone Selector */}
            <div className="pt-4 border-t border-slate-200">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                <Globe className="h-3 w-3" />
                <span>Your Timezone</span>
              </label>
              <select
                value={selectedTz}
                onChange={(e) => setSelectedTz(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Calendar & Slots */}
        <div className="md:w-7/12 p-6 md:p-8 flex flex-col justify-between">
          {!selectedSlot ? (
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-4">Select a Date & Time</h2>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Date Picker */}
                <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  {renderHeader()}
                  {renderDays()}
                  {renderCells()}
                </div>

                {/* Slots List */}
                <div className="lg:w-44 flex-shrink-0">
                  <span className="block text-xs font-bold text-slate-600 mb-2">
                    {format(selectedDate, 'EEEE, dd MMM')}
                  </span>

                  <div className="h-72 overflow-y-auto pr-1 space-y-2">
                    {loadingSlots ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="text-xs text-slate-400 italic mt-6">
                        No slots available on this date.
                      </p>
                    ) : (
                      slots.map((slot: any, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedSlot(slot)}
                          className="w-full py-2 px-3 border border-cyan-600/80 text-cyan-700 hover:bg-gradient-to-r hover:from-cyan-600 hover:to-sky-600 hover:text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-between group"
                        >
                          <span>{slot.formatted_time}</span>
                          {slot.remaining_capacity !== undefined && (
                            <span className="text-[10px] font-semibold bg-cyan-100/80 text-cyan-800 px-1.5 py-0.5 rounded-md group-hover:bg-white/20 group-hover:text-white transition-colors">
                              {slot.remaining_capacity} {slot.remaining_capacity === 1 ? 'spot left' : 'spots left'}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Booking Form */
            <div className="space-y-4">
              <button
                onClick={() => setSelectedSlot(null)}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Slots</span>
              </button>

              <div className="p-3 bg-cyan-50/80 border border-cyan-200/80 rounded-xl text-xs text-cyan-950 font-medium">
                Booking for <strong>{format(parseISO(selectedSlot.start_time), 'EEEE, MMMM dd, yyyy')}</strong> at{' '}
                <strong>{selectedSlot.formatted_time}</strong> ({selectedTz})
              </div>

              {bookingError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {bookingError}
                </div>
              )}

              <form onSubmit={handleBookingSubmit} className="space-y-3.5">
                {/* Meeting Platform / Location Choice (if multiple enabled) */}
                {isAttendeeChoice && allowedLocations.length > 1 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                      <span>How would you like to meet? <span className="text-red-500">*</span></span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {allowedLocations.map((loc: any) => {
                        const isSel = selectedLocation === loc.type;
                        return (
                          <button
                            type="button"
                            key={loc.type}
                            onClick={() => setSelectedLocation(loc.type)}
                            className={`flex items-start p-3 rounded-xl border text-left transition-all ${
                              isSel
                                ? 'border-cyan-600 bg-cyan-50/70 shadow-xs ring-1 ring-cyan-500/30'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                            }`}
                          >
                            <div
                              className={`p-2 rounded-lg mr-2.5 flex-shrink-0 ${
                                isSel ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {loc.type === 'google_meet' ? (
                                <Video className="h-4 w-4" />
                              ) : loc.type === 'phone' ? (
                                <Phone className="h-4 w-4" />
                              ) : loc.type === 'in_person' ? (
                                <MapPin className="h-4 w-4" />
                              ) : (
                                <Video className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                                <span>{loc.label}</span>
                                {isSel && (
                                  <span className="h-2 w-2 rounded-full bg-cyan-600 ring-2 ring-cyan-200"></span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                {loc.type === 'google_meet'
                                  ? 'Video call via Google Meet'
                                  : loc.type === 'phone'
                                  ? (loc.detail || 'Host will call you at your number')
                                  : loc.type === 'in_person'
                                  ? (loc.detail ? `${loc.detail}` : 'In-person meeting')
                                  : 'Video call in browser'}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 1. Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Doe"
                    value={inviteeName}
                    onChange={(e) => setInviteeName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                {/* 2. Email ID */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Email ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="jane@example.com"
                    value={inviteeEmail}
                    onChange={(e) => setInviteeEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                {/* Attendee Phone number if Phone Call chosen and not in custom questions */}
                {selectedLocation === 'phone' &&
                  !answerFields.some((f) => /contact|phone|mobile/i.test(f.label)) && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                        Contact Phone Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+91 98765 43210"
                        value={attendeePhone}
                        onChange={(e) => setAttendeePhone(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        The host will call you at this number at the scheduled time.
                      </p>
                    </div>
                  )}

                {/* 3. Admin-configured intake fields */}
                {answerFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      {field.label}
                      {field.required ? (
                        <span className="text-red-500"> *</span>
                      ) : (
                        <span className="text-slate-400 normal-case font-medium"> (Optional)</span>
                      )}
                    </label>
                    <input
                      type="text"
                      required={field.required}
                      placeholder={`Enter ${field.label.toLowerCase()}...`}
                      value={answerValues[field.key] || ''}
                      onChange={(e) =>
                        setAnswerValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>
                ))}

                {/* 4. Notes / Agenda */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Additional Notes / Agenda <span className="text-slate-400 normal-case font-medium">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Briefly state anything you'd like to discuss..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                {/* Payment notice */}
                {eventType?.payment_provider && eventType.payment_provider !== 'none' && eventType.price_amount && (
                  <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-xs text-violet-800 font-medium">
                    💳 <strong>Payment required:</strong>{' '}
                    {eventType.currency === 'INR' ? '₹' : eventType.currency === 'USD' ? '$' : eventType.currency === 'EUR' ? '€' : eventType.currency + ' '}
                    {(eventType.price_amount / 100).toFixed(2)} via{' '}
                    {eventType.payment_provider === 'razorpay' ? 'Razorpay' : 'Stripe'}.
                    You will be redirected to complete payment after scheduling.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={bookMutation.isPending}
                  className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50"
                >
                  {bookMutation.isPending
                    ? 'Confirming...'
                    : eventType?.payment_provider && eventType.payment_provider !== 'none'
                    ? 'Continue to Payment →'
                    : 'Schedule Meeting'}
                </button>
              </form>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center space-x-2">
            <img src="/badge.jpg" alt="Kavach Connect" className="h-4 w-4 rounded-full object-cover" />
            <span className="text-[11px] text-slate-400 font-medium">
              Powered by Kavach Connect — Enterprise Scheduling
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
