import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/store';
import { BookingField, DEFAULT_BOOKING_FIELDS, parseCustomQuestions, toCustomQuestions } from '../../lib/bookingFields';
import { BookingFieldsEditor } from './BookingFieldsEditor';
import { 
  Plus, 
  Clock, 
  Video, 
  Phone, 
  MapPin, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  HelpCircle,
  X,
  Pencil,
  Layers,
  Sparkles,
  Sliders,
  Shield,
  Calendar,
  Code2,
  Users,
  RefreshCw,
  CreditCard,
  DollarSign
} from 'lucide-react';

export interface AllowedLocation {
  type: string;
  label: string;
  detail?: string;
}

export const AVAILABLE_LOCATION_OPTIONS: { type: string; label: string; defaultDetail?: string }[] = [
  { type: 'google_meet', label: 'Google Meet' },
  { type: 'phone', label: 'Phone Call', defaultDetail: 'Host will call invitee' },
  { type: 'in_person', label: 'In-Person Meeting', defaultDetail: '' },
  { type: 'jitsi', label: 'Kavach Secure Room' },
  { type: 'zoom', label: 'Zoom' },
  { type: 'microsoft_teams', label: 'Microsoft Teams' },
];

export const EventTypesList: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newlyCreatedEvent, setNewlyCreatedEvent] = useState<any>(null);
  const [embedModalEvent, setEmbedModalEvent] = useState<any>(null);

  // Share & Embed Modal State
  const [embedTab, setEmbedTab] = useState<'inline' | 'popup' | 'signature'>('inline');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Edit Modal Form State
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDuration, setEditDuration] = useState(30);
  const [editLocationType, setEditLocationType] = useState('jitsi');
  const [editLocationDetail, setEditLocationDetail] = useState('');
  const [editAllowedLocations, setEditAllowedLocations] = useState<AllowedLocation[]>([]);
  const [editDescription, setEditDescription] = useState('');
  const [editBufferBefore, setEditBufferBefore] = useState(0);
  const [editBufferAfter, setEditBufferAfter] = useState(0);
  const [editMinNotice, setEditMinNotice] = useState(60);
  const [editMaxDaysInAdvance, setEditMaxDaysInAdvance] = useState(30);
  const [editMaxBookingsPerDay, setEditMaxBookingsPerDay] = useState<number | ''>('');
  const [editBookingType, setEditBookingType] = useState('one_on_one');
  const [editGroupCapacity, setEditGroupCapacity] = useState<number | ''>(10);
  const [editAssignedUserIds, setEditAssignedUserIds] = useState<string[]>([]);
  const [editPriceAmount, setEditPriceAmount] = useState<number | ''>('');
  const [editCurrency, setEditCurrency] = useState('INR');
  const [editPaymentProvider, setEditPaymentProvider] = useState('none');

  // Form State
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [duration, setDuration] = useState(30);
  const [locationType, setLocationType] = useState('jitsi');
  const [locationDetail, setLocationDetail] = useState('');
  const [allowedLocations, setAllowedLocations] = useState<AllowedLocation[]>([
    { type: 'google_meet', label: 'Google Meet' },
    { type: 'phone', label: 'Phone Call', detail: 'Host will call invitee' },
    { type: 'in_person', label: 'In-Person Meeting', detail: '' },
  ]);
  const [description, setDescription] = useState('');
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(0);
  const [minNotice, setMinNotice] = useState(60);
  const [maxDaysInAdvance, setMaxDaysInAdvance] = useState(30);
  const [maxBookingsPerDay, setMaxBookingsPerDay] = useState<number | ''>('');
  const [bookingType, setBookingType] = useState('one_on_one');
  const [groupCapacity, setGroupCapacity] = useState<number | ''>(10);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [priceAmount, setPriceAmount] = useState<number | ''>('');
  const [currency, setCurrency] = useState('INR');
  const [paymentProvider, setPaymentProvider] = useState('none');
  const [bookingFields, setBookingFields] = useState<BookingField[]>(
    DEFAULT_BOOKING_FIELDS.map((f) => ({ ...f }))
  );

  const { data: eventTypes = [], isLoading } = useQuery({
    queryKey: ['event-types'],
    queryFn: async () => {
      const res = await api.get('/event-types');
      return res.data;
    },
  });

  const { data: enabledIntegrations = [] } = useQuery({
    queryKey: ['available-integrations'],
    queryFn: async () => {
      const res = await api.get('/integrations/available');
      return res.data;
    },
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ['collaborators'],
    queryFn: async () => {
      try {
        const res = await api.get('/event-types/collaborators');
        return res.data;
      } catch {
        return [];
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/event-types', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
      setIsModalOpen(false);
      resetForm();
      setNewlyCreatedEvent(data);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.patch(`/event-types/${id}`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
      setEditingEvent(null);
      // If the currently edited event was the one in the notice banner, update it
      setNewlyCreatedEvent((prev: any) => (prev?.id === data.id ? data : prev));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.delete(`/event-types/${id}`);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
      setNewlyCreatedEvent((prev: any) => (prev?.id === id ? null : prev));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      return await api.patch(`/event-types/${id}`, { is_active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-types'] });
    },
  });

  // Edit Modal Booking Fields State
  const [editBookingFields, setEditBookingFields] = useState<BookingField[]>(
    DEFAULT_BOOKING_FIELDS.map((f) => ({ ...f }))
  );

  const resetForm = () => {
    setTitle('');
    setSlug('');
    setDuration(30);
    setLocationType('jitsi');
    setLocationDetail('');
    setAllowedLocations([
      { type: 'google_meet', label: 'Google Meet' },
      { type: 'phone', label: 'Phone Call', detail: 'Host will call invitee' },
      { type: 'in_person', label: 'In-Person Meeting', detail: '' },
    ]);
    setDescription('');
    setBufferBefore(0);
    setBufferAfter(0);
    setMinNotice(60);
    setMaxDaysInAdvance(30);
    setMaxBookingsPerDay('');
    setBookingType('one_on_one');
    setGroupCapacity(10);
    setAssignedUserIds([]);
    setPriceAmount('');
    setCurrency('INR');
    setPaymentProvider('none');
    setBookingFields(DEFAULT_BOOKING_FIELDS.map((f) => ({ ...f })));
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slug || slug === title.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
  };

  const copyBookingLink = (typeSlug: string, id: string) => {
    if (!user) return;
    const url = `${window.location.origin}/${user.username}/${typeSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title,
      slug,
      duration_minutes: Number(duration),
      location_type: locationType,
      location_detail: locationDetail,
      allowed_locations: locationType === 'attendee_choice' ? allowedLocations : [],
      description,
      booking_type: bookingType,
      group_capacity: bookingType === 'group' ? (groupCapacity !== '' ? Number(groupCapacity) : 10) : null,
      assigned_user_ids: (bookingType === 'round_robin' || bookingType === 'collective') ? assignedUserIds : [],
      buffer_before_minutes: Number(bufferBefore),
      buffer_after_minutes: Number(bufferAfter),
      min_notice_minutes: Number(minNotice),
      max_days_in_advance: Number(maxDaysInAdvance) || 30,
      max_bookings_per_day: maxBookingsPerDay !== '' ? Number(maxBookingsPerDay) : null,
      custom_questions: toCustomQuestions(bookingFields),
      is_active: true,
      price_amount: paymentProvider !== 'none' && priceAmount !== '' ? Math.round(Number(priceAmount) * 100) : null,
      currency: currency,
      payment_provider: paymentProvider,
    });
  };

  const handleOpenEdit = (et: any) => {
    setEditingEvent(et);
    setEditTitle(et.title || '');
    setEditSlug(et.slug || '');
    setEditDuration(et.duration_minutes || 30);
    setEditLocationType(et.location_type || 'jitsi');
    setEditLocationDetail(et.location_detail || '');
    setEditAllowedLocations(
      et.allowed_locations && et.allowed_locations.length > 0
        ? et.allowed_locations
        : [
            { type: 'google_meet', label: 'Google Meet' },
            { type: 'phone', label: 'Phone Call', detail: 'Host will call invitee' },
            { type: 'in_person', label: 'In-Person Meeting', detail: '' },
          ]
    );
    setEditDescription(et.description || '');
    setEditBufferBefore(et.buffer_before_minutes ?? 0);
    setEditBufferAfter(et.buffer_after_minutes ?? 0);
    setEditMinNotice(et.min_notice_minutes ?? 60);
    setEditMaxDaysInAdvance(et.max_days_in_advance ?? 30);
    setEditMaxBookingsPerDay(et.max_bookings_per_day ?? '');
    setEditBookingType(et.booking_type || 'one_on_one');
    setEditGroupCapacity(et.group_capacity ?? 10);
    setEditAssignedUserIds(et.assigned_user_ids || []);
    setEditPriceAmount(et.price_amount ? et.price_amount / 100 : '');
    setEditCurrency(et.currency || 'INR');
    setEditPaymentProvider(et.payment_provider || 'none');
    setEditBookingFields(parseCustomQuestions(et.custom_questions));
  };

  const handleEditTitleChange = (val: string) => {
    setEditTitle(val);
    if (!editSlug || editSlug === editTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
      setEditSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    updateMutation.mutate({
      id: editingEvent.id,
      payload: {
        title: editTitle,
        slug: editSlug,
        duration_minutes: Number(editDuration),
        location_type: editLocationType,
        location_detail: editLocationDetail,
        allowed_locations: editLocationType === 'attendee_choice' ? editAllowedLocations : [],
        description: editDescription,
        booking_type: editBookingType,
        group_capacity: editBookingType === 'group' ? (editGroupCapacity !== '' ? Number(editGroupCapacity) : 10) : null,
        assigned_user_ids: (editBookingType === 'round_robin' || editBookingType === 'collective') ? editAssignedUserIds : [],
        buffer_before_minutes: Number(editBufferBefore),
        buffer_after_minutes: Number(editBufferAfter),
        min_notice_minutes: Number(editMinNotice),
        max_days_in_advance: Number(editMaxDaysInAdvance) || 30,
        max_bookings_per_day: editMaxBookingsPerDay !== '' ? Number(editMaxBookingsPerDay) : null,
        custom_questions: toCustomQuestions(editBookingFields),
        price_amount: editPaymentProvider !== 'none' && editPriceAmount !== '' ? Math.round(Number(editPriceAmount) * 100) : null,
        currency: editCurrency,
        payment_provider: editPaymentProvider,
      },
    });
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
      case 'attendee_choice':
        return <Sparkles className="h-4 w-4 text-violet-600" />;
      case 'jitsi':
      case 'google_meet':
      case 'zoom':
      case 'microsoft_teams':
      case 'whereby':
        return <Video className="h-4 w-4 text-blue-600" />;
      case 'phone':
        return <Phone className="h-4 w-4 text-emerald-600" />;
      case 'in_person':
        return <MapPin className="h-4 w-4 text-amber-600" />;
      default:
        return <LinkIcon className="h-4 w-4 text-slate-600" />;
    }
  };

  const formatLocationName = (type: string) => {
    if (type === 'attendee_choice') return 'Attendee Choice';
    switch (type) {
      case 'jitsi':
        return 'Video Call';
      case 'google_meet':
        return 'Google Meet';
      case 'zoom':
        return 'Zoom Video';
      case 'microsoft_teams':
        return 'Microsoft Teams';
      case 'whereby':
        return 'Whereby';
      case 'phone':
        return 'Phone Call';
      case 'in_person':
        return 'In-Person';
      case 'custom':
        return 'Custom Link';
      default:
        return (type || 'Online').replace(/_/g, ' ');
    }
  };

  return (
    <div>
      {/* Orion Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 text-white flex items-center justify-center shadow-md shadow-cyan-500/20 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Event Types</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-cyan-100 text-cyan-700 border border-cyan-200">
                {eventTypes.length} Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure bookable templates, appointment lengths, video platforms, and custom questions
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Event Type</span>
        </button>
      </div>

      {/* Post-Creation Prompt */}
      {newlyCreatedEvent && (
        <div className="mb-6 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200/80 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700 flex-shrink-0">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-bold text-slate-900 text-sm">
                  "{newlyCreatedEvent.title}" template created successfully!
                </h4>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  Ready
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Review and modify duration, buffer times, instructions, or booking link details.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-end sm:self-auto flex-shrink-0">
            <button
              onClick={() => copyBookingLink(newlyCreatedEvent.slug, newlyCreatedEvent.id)}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
            >
              {copiedId === newlyCreatedEvent.id ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleOpenEdit(newlyCreatedEvent)}
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-cyan-500/20"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit Template</span>
            </button>
            <button
              onClick={() => setNewlyCreatedEvent(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              title="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : eventTypes.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center shadow-xs">
          <Clock className="h-12 w-12 text-slate-300 mx-auto" />
          <h3 className="mt-4 text-base font-bold text-slate-900">No event types created yet</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Event types are meeting templates like a 15-minute quick chat or 45-minute consultation.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 inline-flex items-center space-x-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-cyan-500/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Create Your First Template</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {eventTypes.map((et: any) => {
            const bookingUrl = `/${user?.username}/${et.slug}`;
            return (
              <div
                key={et.id}
                className={`bg-white border rounded-xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between ${
                  et.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-900 text-base">{et.title}</h3>
                      <div className="flex items-center space-x-3 text-xs text-slate-500 font-medium">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{et.duration_minutes}m</span>
                        </span>
                        {et.location_type === 'attendee_choice' ? (
                          <span className="inline-flex items-center space-x-1 text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-violet-200">
                            <Sparkles className="h-3 w-3 text-violet-500" />
                            <span>Attendee Choice ({et.allowed_locations?.length || 'Multiple'})</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1 capitalize">
                            {getLocationIcon(et.location_type)}
                            <span>{formatLocationName(et.location_type)}</span>
                          </span>
                        )}
                      </div>

                      {/* Booking Type / Distribution Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {et.booking_type === 'round_robin' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                            <RefreshCw className="h-2.5 w-2.5 text-purple-600" />
                            <span>Round-Robin ({1 + (et.assigned_user_ids?.length || 0)} hosts)</span>
                          </span>
                        )}
                        {et.booking_type === 'collective' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <Users className="h-2.5 w-2.5 text-emerald-600" />
                            <span>Collective Panel ({1 + (et.assigned_user_ids?.length || 0)} hosts)</span>
                          </span>
                        )}
                        {et.booking_type === 'group' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md">
                            <Users className="h-2.5 w-2.5 text-orange-600" />
                            <span>Group Session (Cap: {et.group_capacity || 10})</span>
                          </span>
                        )}
                        {(!et.booking_type || et.booking_type === 'one_on_one') && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            <span>1-on-1</span>
                          </span>
                        )}
                      </div>

                      {/* Scheduling Limits & Buffer Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                        {((et.buffer_before_minutes || 0) > 0 || (et.buffer_after_minutes || 0) > 0) && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200/60 px-2 py-0.5 rounded-md"
                            title={`Buffer: ${et.buffer_before_minutes || 0}m before, ${et.buffer_after_minutes || 0}m after`}
                          >
                            <Shield className="h-2.5 w-2.5 text-cyan-600" />
                            <span>Buffer {et.buffer_before_minutes || 0}m/{et.buffer_after_minutes || 0}m</span>
                          </span>
                        )}
                        {et.max_bookings_per_day && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md"
                            title={`Daily cap: At most ${et.max_bookings_per_day} booking(s) per day`}
                          >
                            <Calendar className="h-2.5 w-2.5 text-amber-600" />
                            <span>Max {et.max_bookings_per_day}/day</span>
                          </span>
                        )}
                        {et.max_days_in_advance && et.max_days_in_advance !== 30 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            <span>{et.max_days_in_advance}d window</span>
                          </span>
                        )}
                        {(et.min_notice_minutes || 0) > 60 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            <span>{Math.round(et.min_notice_minutes / 60)}h notice</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        toggleActiveMutation.mutate({ id: et.id, is_active: !et.is_active })
                      }
                      title={et.is_active ? 'Disable' : 'Enable'}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {et.is_active ? (
                        <ToggleRight className="h-6 w-6 text-blue-600" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-slate-300" />
                      )}
                    </button>
                  </div>

                  {et.description && (
                    <p className="mt-3 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {et.description}
                    </p>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyBookingLink(et.slug, et.id)}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-md transition-colors"
                    >
                      {copiedId === et.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpenEdit(et)}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md transition-colors"
                      title="Edit Template"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => {
                        setEmbedModalEvent(et);
                        setEmbedTab('inline');
                      }}
                      className="inline-flex items-center space-x-1 text-xs font-semibold text-cyan-700 hover:text-cyan-800 bg-cyan-50 hover:bg-cyan-100 px-2.5 py-1.5 rounded-md transition-colors"
                      title="Share & Embed Code"
                    >
                      <Code2 className="h-3.5 w-3.5 text-cyan-600" />
                      <span>Embed</span>
                    </button>

                    <a
                      href={bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                      title="Open public booking page"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm(`Delete "${et.title}"?`)) {
                        deleteMutation.mutate(et.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                    title="Delete Event Type"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Event Type Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div
            className="modal-sheet max-w-lg animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Create New Event Type</h3>
                <p className="text-xs text-slate-500 mt-0.5">Configure schedule, duration, location and intake</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body custom-scrollbar space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Event Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 30 Minute Strategy Call"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    URL Slug
                  </label>
                  <div className="flex rounded-xl shadow-2xs">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                      /{user?.username}/
                    </span>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-r-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Duration (Minutes)
                    </label>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 bg-white"
                    >
                      <option value={15}>15 mins</option>
                      <option value={30}>30 mins</option>
                      <option value={45}>45 mins</option>
                      <option value={60}>60 mins</option>
                      <option value={90}>90 mins</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Location / Platform
                    </label>
                    <select
                      value={locationType}
                      onChange={(e) => setLocationType(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 bg-white font-medium"
                    >
                      <option value="attendee_choice">✨ Let Attendee Choose (Multiple Locations)</option>
                      <optgroup label="Single Platform">
                        {enabledIntegrations.length > 0 ? (
                          enabledIntegrations.map((item: any) => (
                            <option key={item.provider} value={item.provider}>
                              {item.display_name}
                            </option>
                          ))
                        ) : (
                          <option value="jitsi">Video Call (Web Browser)</option>
                        )}
                        {(user?.google_email || user?.google_meet_url) && !enabledIntegrations.some((item: any) => item.provider === 'google_meet') && (
                          <option value="google_meet">Google Meet ({user.google_email || 'Personal Link'})</option>
                        )}
                        <option value="phone">Phone Call</option>
                        <option value="in_person">In-Person Meeting</option>
                        <option value="custom">Custom Web Link</option>
                      </optgroup>
                    </select>
                    {!user?.google_email && !user?.google_meet_url && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Tip: Set your Google Meet link or connect Google in your Profile to use Google Meet.
                      </p>
                    )}
                  </div>
                </div>

                {locationType === 'attendee_choice' && (
                  <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-violet-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                        <span>Allowed Platforms for Attendee</span>
                      </label>
                      <span className="text-[11px] text-violet-600 font-medium">Select at least 1</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Invitees will be prompted to pick their preferred meeting platform when scheduling on your booking page.
                    </p>
                    <div className="grid grid-cols-1 gap-2.5">
                      {AVAILABLE_LOCATION_OPTIONS.map((opt) => {
                        const isChecked = allowedLocations.some((l) => l.type === opt.type);
                        const currentConfig = allowedLocations.find((l) => l.type === opt.type);
                        return (
                          <div key={opt.type} className="bg-white border border-violet-100 rounded-lg p-3 space-y-2 shadow-2xs">
                            <label className="flex items-center space-x-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAllowedLocations((prev) => [
                                      ...prev,
                                      { type: opt.type, label: opt.label, detail: opt.defaultDetail || '' },
                                    ]);
                                  } else {
                                    if (allowedLocations.length > 1) {
                                      setAllowedLocations((prev) => prev.filter((l) => l.type !== opt.type));
                                    }
                                  }
                                }}
                                className="rounded text-violet-600 focus:ring-violet-500 h-4 w-4"
                              />
                              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                {getLocationIcon(opt.type)}
                                <span>{opt.label}</span>
                              </span>
                            </label>
                            {isChecked && opt.type === 'in_person' && (
                              <div className="pl-6">
                                <input
                                  type="text"
                                  placeholder="Enter office address or meeting room..."
                                  value={currentConfig?.detail || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAllowedLocations((prev) =>
                                      prev.map((l) => (l.type === 'in_person' ? { ...l, detail: val } : l))
                                    );
                                  }}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                              </div>
                            )}
                            {isChecked && opt.type === 'phone' && (
                              <div className="pl-6">
                                <input
                                  type="text"
                                  placeholder="Call instructions (e.g. Host will call attendee at their contact number)..."
                                  value={currentConfig?.detail || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setAllowedLocations((prev) =>
                                      prev.map((l) => (l.type === 'phone' ? { ...l, detail: val } : l))
                                    );
                                  }}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {['phone', 'in_person', 'custom'].includes(locationType) && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Location Details
                    </label>
                    <input
                      type="text"
                      placeholder={
                        locationType === 'phone'
                          ? 'Host will call invitee or phone number'
                          : locationType === 'in_person'
                          ? 'Office address or room'
                          : 'https://...'
                      }
                      value={locationDetail}
                      onChange={(e) => setLocationDetail(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Description / Instructions
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Share a brief overview of what this meeting is about..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                <BookingFieldsEditor fields={bookingFields} onChange={setBookingFields} />

                {/* Scheduling Limits & Buffer Engine */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5 text-cyan-600" />
                      <span>Scheduling Limits & Buffers</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Protect host focus & calendar</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Buffer Before</label>
                      <select
                        value={bufferBefore}
                        onChange={(e) => setBufferBefore(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={0}>0 min (None)</option>
                        <option value={5}>5 min before</option>
                        <option value={10}>10 min before</option>
                        <option value={15}>15 min before</option>
                        <option value={30}>30 min before</option>
                        <option value={45}>45 min before</option>
                        <option value={60}>60 min before</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Buffer After</label>
                      <select
                        value={bufferAfter}
                        onChange={(e) => setBufferAfter(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={0}>0 min (None)</option>
                        <option value={5}>5 min after</option>
                        <option value={10}>10 min after</option>
                        <option value={15}>15 min after</option>
                        <option value={30}>30 min after</option>
                        <option value={45}>45 min after</option>
                        <option value={60}>60 min after</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Minimum Notice</label>
                      <select
                        value={minNotice}
                        onChange={(e) => setMinNotice(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={0}>Instant (No notice)</option>
                        <option value={15}>15 min notice</option>
                        <option value={30}>30 min notice</option>
                        <option value={60}>1 hour notice</option>
                        <option value={120}>2 hours notice</option>
                        <option value={240}>4 hours notice</option>
                        <option value={720}>12 hours notice</option>
                        <option value={1440}>24 hours notice</option>
                        <option value={2880}>48 hours notice</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Max Booking Window</label>
                      <select
                        value={maxDaysInAdvance}
                        onChange={(e) => setMaxDaysInAdvance(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={7}>7 calendar days</option>
                        <option value={14}>14 calendar days</option>
                        <option value={30}>30 calendar days</option>
                        <option value={60}>60 calendar days</option>
                        <option value={90}>90 calendar days</option>
                        <option value={180}>180 calendar days</option>
                        <option value={365}>365 calendar days</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Daily Booking Cap</label>
                      <select
                        value={maxBookingsPerDay}
                        onChange={(e) => setMaxBookingsPerDay(e.target.value === '' ? '' : Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value="">No limit (Unlimited)</option>
                        <option value={1}>1 booking / day</option>
                        <option value={2}>2 bookings / day</option>
                        <option value={3}>3 bookings / day</option>
                        <option value={4}>4 bookings / day</option>
                        <option value={5}>5 bookings / day</option>
                        <option value={8}>8 bookings / day</option>
                        <option value={10}>10 bookings / day</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Team Distribution & Booking Type */}
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-cyan-600" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Booking Distribution & Capacity
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-400">Team routing & spots</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'one_on_one', label: '1-on-1', desc: 'Standard single host' },
                      { id: 'round_robin', label: 'Round-Robin', desc: 'Auto-rotate across team' },
                      { id: 'collective', label: 'Collective', desc: 'All hosts must be free' },
                      { id: 'group', label: 'Group Session', desc: 'Multiple attendees / slot' },
                    ].map((bt) => (
                      <button
                        key={bt.id}
                        type="button"
                        onClick={() => setBookingType(bt.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          bookingType === bt.id
                            ? 'border-cyan-600 bg-cyan-50/50 ring-1 ring-cyan-600 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`text-xs font-bold ${bookingType === bt.id ? 'text-cyan-900' : 'text-slate-800'}`}>
                          {bt.label}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{bt.desc}</div>
                      </button>
                    ))}
                  </div>

                  {bookingType === 'group' && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-1.5">
                      <label className="block text-[11px] font-bold text-amber-900">
                        Max Attendees per Slot (Group Capacity)
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={100}
                        value={groupCapacity}
                        onChange={(e) => setGroupCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-amber-300 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        placeholder="e.g. 10"
                      />
                      <p className="text-[10px] text-amber-700">
                        Slots remain bookable by different invitees until this limit is reached.
                      </p>
                    </div>
                  )}

                  {(bookingType === 'round_robin' || bookingType === 'collective') && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-800">
                          Assign Team Members ({collaborators.filter((c: any) => c.id !== user?.id).length} available)
                        </label>
                        <span className="text-[10px] text-slate-500">
                          {bookingType === 'round_robin' ? 'Distributed evenly' : 'Mutual panel'}
                        </span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {collaborators
                          .filter((c: any) => c.id !== user?.id)
                          .map((collab: any) => {
                            const isAssigned = assignedUserIds.includes(collab.id);
                            return (
                              <label
                                key={collab.id}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isAssigned ? 'bg-cyan-50/60 border-cyan-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setAssignedUserIds([...assignedUserIds, collab.id]);
                                      } else {
                                        setAssignedUserIds(assignedUserIds.filter((id) => id !== collab.id));
                                      }
                                    }}
                                    className="h-3.5 w-3.5 text-cyan-600 rounded border-slate-300 focus:ring-cyan-500"
                                  />
                                  <div>
                                    <div className="font-semibold text-slate-800">{collab.name}</div>
                                    <div className="text-[10px] text-slate-400">{collab.email}</div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-medium text-slate-400 uppercase">{collab.role}</span>
                              </label>
                            );
                          })}
                        {collaborators.filter((c: any) => c.id !== user?.id).length === 0 && (
                          <p className="text-[11px] text-slate-400 italic py-1">
                            No other active team members found. (Invite members under Employees admin).
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Paid Meeting Section */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center space-x-2">
                  <CreditCard className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Paid Meeting</h3>
                  <span className="ml-2 text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Optional</span>
                </div>
                <p className="text-[11px] text-slate-500">Charge invitees before they can confirm a booking. Price is stored in the smallest currency unit × 100 (e.g., ₹500 → 50000 paise).</p>

                {/* Payment provider toggle */}
                <div className="flex gap-2">
                  {[
                    { id: 'none', label: 'Free' },
                    { id: 'razorpay', label: 'Razorpay' },
                    { id: 'stripe', label: 'Stripe' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentProvider(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        paymentProvider === opt.id
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {paymentProvider !== 'none' && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Price</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={priceAmount}
                          onChange={(e) => setPriceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="e.g. 500"
                          className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Currency</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                      >
                        <option value="INR">INR ₹</option>
                        <option value="USD">USD $</option>
                        <option value="EUR">EUR €</option>
                        <option value="GBP">GBP £</option>
                        <option value="SGD">SGD S$</option>
                        <option value="AED">AED د.إ</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Event Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Event Type Modal */}
      {editingEvent && (
        <div className="modal-overlay" onClick={() => setEditingEvent(null)}>
          <div
            className="modal-sheet max-w-lg animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Edit Template</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update meeting parameters, buffers, and booking preferences
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="modal-body custom-scrollbar space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Event Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 30 Minute Strategy Call"
                    value={editTitle}
                    onChange={(e) => handleEditTitleChange(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    URL Slug
                  </label>
                  <div className="flex rounded-xl shadow-2xs">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                      /{user?.username}/
                    </span>
                    <input
                      type="text"
                      required
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-r-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Duration (Minutes)
                    </label>
                    <select
                      value={editDuration}
                      onChange={(e) => setEditDuration(Number(e.target.value))}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 bg-white"
                    >
                      <option value={15}>15 mins</option>
                      <option value={30}>30 mins</option>
                      <option value={45}>45 mins</option>
                      <option value={60}>60 mins</option>
                      <option value={90}>90 mins</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Location / Platform
                    </label>
                    <select
                      value={editLocationType}
                      onChange={(e) => setEditLocationType(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 bg-white font-medium"
                    >
                      <option value="attendee_choice">✨ Let Attendee Choose (Multiple Locations)</option>
                      <optgroup label="Single Platform">
                        {enabledIntegrations.length > 0 ? (
                          enabledIntegrations.map((item: any) => (
                            <option key={item.provider} value={item.provider}>
                              {item.display_name}
                            </option>
                          ))
                        ) : (
                          <option value="jitsi">Video Call (Web Browser)</option>
                        )}
                        {(user?.google_email || user?.google_meet_url) && !enabledIntegrations.some((item: any) => item.provider === 'google_meet') && (
                          <option value="google_meet">Google Meet ({user.google_email || 'Personal Link'})</option>
                        )}
                        {!['phone', 'in_person', 'custom', 'attendee_choice'].includes(editLocationType) &&
                          editLocationType !== 'google_meet' &&
                          !enabledIntegrations.some((item: any) => item.provider === editLocationType) && (
                            <option value={editLocationType}>
                              {formatLocationName(editLocationType)} (Currently Disabled)
                            </option>
                          )}
                        <option value="phone">Phone Call</option>
                        <option value="in_person">In-Person Meeting</option>
                        <option value="custom">Custom Web Link</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {editLocationType === 'attendee_choice' && (
                  <div className="p-4 bg-violet-50/70 border border-violet-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-violet-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                        <span>Allowed Platforms for Attendee</span>
                      </label>
                      <span className="text-[11px] text-violet-600 font-medium">Select at least 1</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Invitees will be prompted to pick their preferred meeting platform when scheduling on your booking page.
                    </p>
                    <div className="grid grid-cols-1 gap-2.5">
                      {AVAILABLE_LOCATION_OPTIONS.map((opt) => {
                        const isChecked = editAllowedLocations.some((l) => l.type === opt.type);
                        const currentConfig = editAllowedLocations.find((l) => l.type === opt.type);
                        return (
                          <div key={opt.type} className="bg-white border border-violet-100 rounded-lg p-3 space-y-2 shadow-2xs">
                            <label className="flex items-center space-x-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditAllowedLocations((prev) => [
                                      ...prev,
                                      { type: opt.type, label: opt.label, detail: opt.defaultDetail || '' },
                                    ]);
                                  } else {
                                    if (editAllowedLocations.length > 1) {
                                      setEditAllowedLocations((prev) => prev.filter((l) => l.type !== opt.type));
                                    }
                                  }
                                }}
                                className="rounded text-violet-600 focus:ring-violet-500 h-4 w-4"
                              />
                              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                                {getLocationIcon(opt.type)}
                                <span>{opt.label}</span>
                              </span>
                            </label>
                            {isChecked && opt.type === 'in_person' && (
                              <div className="pl-6">
                                <input
                                  type="text"
                                  placeholder="Enter office address or meeting room..."
                                  value={currentConfig?.detail || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditAllowedLocations((prev) =>
                                      prev.map((l) => (l.type === 'in_person' ? { ...l, detail: val } : l))
                                    );
                                  }}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                              </div>
                            )}
                            {isChecked && opt.type === 'phone' && (
                              <div className="pl-6">
                                <input
                                  type="text"
                                  placeholder="Call instructions (e.g. Host will call attendee at their contact number)..."
                                  value={currentConfig?.detail || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditAllowedLocations((prev) =>
                                      prev.map((l) => (l.type === 'phone' ? { ...l, detail: val } : l))
                                    );
                                  }}
                                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {['phone', 'in_person', 'custom'].includes(editLocationType) && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                      Location Details
                    </label>
                    <input
                      type="text"
                      placeholder={
                        editLocationType === 'phone'
                          ? 'Host will call invitee or phone number'
                          : editLocationType === 'in_person'
                          ? 'Office address or room'
                          : 'https://...'
                      }
                      value={editLocationDetail}
                      onChange={(e) => setEditLocationDetail(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Description / Instructions
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Share a brief overview of what this meeting is about..."
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                  />
                </div>

                <BookingFieldsEditor fields={editBookingFields} onChange={setEditBookingFields} />

                {/* Scheduling Limits & Buffer Engine */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5 text-cyan-600" />
                      <span>Scheduling Limits & Buffers</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Protect host focus & calendar</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Buffer Before</label>
                      <select
                        value={editBufferBefore}
                        onChange={(e) => setEditBufferBefore(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={0}>0 min (None)</option>
                        <option value={5}>5 min before</option>
                        <option value={10}>10 min before</option>
                        <option value={15}>15 min before</option>
                        <option value={30}>30 min before</option>
                        <option value={45}>45 min before</option>
                        <option value={60}>60 min before</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Buffer After</label>
                      <select
                        value={editBufferAfter}
                        onChange={(e) => setEditBufferAfter(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={0}>0 min (None)</option>
                        <option value={5}>5 min after</option>
                        <option value={10}>10 min after</option>
                        <option value={15}>15 min after</option>
                        <option value={30}>30 min after</option>
                        <option value={45}>45 min after</option>
                        <option value={60}>60 min after</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Minimum Notice</label>
                      <select
                        value={editMinNotice}
                        onChange={(e) => setEditMinNotice(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={0}>Instant (No notice)</option>
                        <option value={15}>15 min notice</option>
                        <option value={30}>30 min notice</option>
                        <option value={60}>1 hour notice</option>
                        <option value={120}>2 hours notice</option>
                        <option value={240}>4 hours notice</option>
                        <option value={720}>12 hours notice</option>
                        <option value={1440}>24 hours notice</option>
                        <option value={2880}>48 hours notice</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Max Booking Window</label>
                      <select
                        value={editMaxDaysInAdvance}
                        onChange={(e) => setEditMaxDaysInAdvance(Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value={7}>7 calendar days</option>
                        <option value={14}>14 calendar days</option>
                        <option value={30}>30 calendar days</option>
                        <option value={60}>60 calendar days</option>
                        <option value={90}>90 calendar days</option>
                        <option value={180}>180 calendar days</option>
                        <option value={365}>365 calendar days</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600">Daily Booking Cap</label>
                      <select
                        value={editMaxBookingsPerDay}
                        onChange={(e) => setEditMaxBookingsPerDay(e.target.value === '' ? '' : Number(e.target.value))}
                        className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                      >
                        <option value="">No limit (Unlimited)</option>
                        <option value={1}>1 booking / day</option>
                        <option value={2}>2 bookings / day</option>
                        <option value={3}>3 bookings / day</option>
                        <option value={4}>4 bookings / day</option>
                        <option value={5}>5 bookings / day</option>
                        <option value={8}>8 bookings / day</option>
                        <option value={10}>10 bookings / day</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Team Distribution & Booking Type */}
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-cyan-600" />
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Booking Distribution & Capacity
                      </h3>
                    </div>
                    <span className="text-[11px] text-slate-400">Team routing & spots</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'one_on_one', label: '1-on-1', desc: 'Standard single host' },
                      { id: 'round_robin', label: 'Round-Robin', desc: 'Auto-rotate across team' },
                      { id: 'collective', label: 'Collective', desc: 'All hosts must be free' },
                      { id: 'group', label: 'Group Session', desc: 'Multiple attendees / slot' },
                    ].map((bt) => (
                      <button
                        key={bt.id}
                        type="button"
                        onClick={() => setEditBookingType(bt.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          editBookingType === bt.id
                            ? 'border-cyan-600 bg-cyan-50/50 ring-1 ring-cyan-600 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`text-xs font-bold ${editBookingType === bt.id ? 'text-cyan-900' : 'text-slate-800'}`}>
                          {bt.label}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{bt.desc}</div>
                      </button>
                    ))}
                  </div>

                  {editBookingType === 'group' && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl space-y-1.5">
                      <label className="block text-[11px] font-bold text-amber-900">
                        Max Attendees per Slot (Group Capacity)
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={100}
                        value={editGroupCapacity}
                        onChange={(e) => setEditGroupCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-amber-300 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        placeholder="e.g. 10"
                      />
                      <p className="text-[10px] text-amber-700">
                        Slots remain bookable by different invitees until this limit is reached.
                      </p>
                    </div>
                  )}

                  {(editBookingType === 'round_robin' || editBookingType === 'collective') && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-800">
                          Assign Team Members ({collaborators.filter((c: any) => c.id !== user?.id).length} available)
                        </label>
                        <span className="text-[10px] text-slate-500">
                          {editBookingType === 'round_robin' ? 'Distributed evenly' : 'Mutual panel'}
                        </span>
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                        {collaborators
                          .filter((c: any) => c.id !== user?.id)
                          .map((collab: any) => {
                            const isAssigned = editAssignedUserIds.includes(collab.id);
                            return (
                              <label
                                key={collab.id}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isAssigned ? 'bg-cyan-50/60 border-cyan-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="checkbox"
                                    checked={isAssigned}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setEditAssignedUserIds([...editAssignedUserIds, collab.id]);
                                      } else {
                                        setEditAssignedUserIds(editAssignedUserIds.filter((id) => id !== collab.id));
                                      }
                                    }}
                                    className="h-3.5 w-3.5 text-cyan-600 rounded border-slate-300 focus:ring-cyan-500"
                                  />
                                  <div>
                                    <div className="font-semibold text-slate-800">{collab.name}</div>
                                    <div className="text-[10px] text-slate-400">{collab.email}</div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-medium text-slate-400 uppercase">{collab.role}</span>
                              </label>
                            );
                          })}
                        {collaborators.filter((c: any) => c.id !== user?.id).length === 0 && (
                          <p className="text-[11px] text-slate-400 italic py-1">
                            No other active team members found. (Invite members under Employees admin).
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Paid Meeting Section - Edit */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-4 w-4 text-violet-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Paid Meeting</h3>
                    <span className="ml-2 text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Optional</span>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { id: 'none', label: 'Free' },
                      { id: 'razorpay', label: 'Razorpay' },
                      { id: 'stripe', label: 'Stripe' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditPaymentProvider(opt.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          editPaymentProvider === opt.id
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {editPaymentProvider !== 'none' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Price</label>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={editPriceAmount}
                            onChange={(e) => setEditPriceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="e.g. 500"
                            className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Currency</label>
                        <select
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                        >
                          <option value="INR">INR ₹</option>
                          <option value="USD">USD $</option>
                          <option value="EUR">EUR €</option>
                          <option value="GBP">GBP £</option>
                          <option value="SGD">SGD S$</option>
                          <option value="AED">AED د.إ</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {updateMutation.isError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                    {(updateMutation.error as any)?.response?.data?.detail || 'Failed to save changes. Please try again.'}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-cyan-500/20 disabled:opacity-50 transition-all"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share & Embed Modal */}
      {embedModalEvent && (
        <div className="modal-overlay" onClick={() => setEmbedModalEvent(null)}>
          <div
            className="modal-sheet max-w-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-cyan-600" />
                  <span>Share & Embed: {embedModalEvent.title}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Integrate this booking page into your website, landing page, or email signature
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEmbedModalEvent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Tab Selector */}
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setEmbedTab('inline')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    embedTab === 'inline' ? 'bg-white text-cyan-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Inline Website Embed
                </button>
                <button
                  type="button"
                  onClick={() => setEmbedTab('popup')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    embedTab === 'popup' ? 'bg-white text-cyan-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Popup Button Widget
                </button>
                <button
                  type="button"
                  onClick={() => setEmbedTab('signature')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                    embedTab === 'signature' ? 'bg-white text-cyan-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Email Signature
                </button>
              </div>

              {/* Tab 1: Inline Embed */}
              {embedTab === 'inline' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Paste this snippet directly into your website's HTML to embed the scheduler seamlessly into any webpage or blog post:
                  </p>
                  <div className="relative bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto">
                    <code>
                      {`<iframe src="${window.location.origin}/embed/${user?.username}/${embedModalEvent.slug}" width="100%" height="720" frameborder="0" style="border:0; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);"></iframe>`}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `<iframe src="${window.location.origin}/embed/${user?.username}/${embedModalEvent.slug}" width="100%" height="720" frameborder="0" style="border:0; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06);"></iframe>`;
                        navigator.clipboard.writeText(snippet);
                        setCopiedSnippet('inline');
                        setTimeout(() => setCopiedSnippet(null), 2000);
                      }}
                      className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shadow-sm"
                    >
                      {copiedSnippet === 'inline' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedSnippet === 'inline' ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Floating Popup Widget */}
              {embedTab === 'popup' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Add a popup button that opens your calendar in an overlay modal when visitors click it:
                  </p>
                  <div className="relative bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto">
                    <code>
                      {`<!-- Kavach Connect Popup Button -->
<button onclick="window.open('${window.location.origin}/${user?.username}/${embedModalEvent.slug}', 'kavach_popup', 'width=800,height=750')" style="background:#0891b2; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:sans-serif;">
  Book a Meeting
</button>`}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `<button onclick="window.open('${window.location.origin}/${user?.username}/${embedModalEvent.slug}', 'kavach_popup', 'width=800,height=750')" style="background:#0891b2; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-weight:bold; cursor:pointer; font-family:sans-serif;">\n  Book a Meeting\n</button>`;
                        navigator.clipboard.writeText(snippet);
                        setCopiedSnippet('popup');
                        setTimeout(() => setCopiedSnippet(null), 2000);
                      }}
                      className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shadow-sm"
                    >
                      {copiedSnippet === 'popup' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedSnippet === 'popup' ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Email Signature Card */}
              {embedTab === 'signature' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Add this HTML snippet to your Gmail or Outlook email signature to let clients book meetings directly:
                  </p>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-cyan-600 text-white font-bold text-sm flex items-center justify-center">
                        {user?.name?.charAt(0) || 'K'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs">{user?.name}</div>
                        <div className="text-slate-500 text-[11px]">{user?.email}</div>
                        <a
                          href={`${window.location.origin}/${user?.username}/${embedModalEvent.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-2 px-3 py-1 bg-cyan-600 text-white rounded-md text-[11px] font-semibold hover:bg-cyan-700"
                        >
                          📅 Schedule a Meeting with me
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = `<table style="font-family:sans-serif; font-size:13px; color:#333;"><tr><td style="padding-right:12px;"><div style="width:40px; height:40px; border-radius:50%; background:#0891b2; color:#fff; text-align:center; line-height:40px; font-weight:bold;">${user?.name?.charAt(0) || 'K'}</div></td><td><strong>${user?.name}</strong><br/><span style="color:#666;">${user?.email}</span><br/><a href="${window.location.origin}/${user?.username}/${embedModalEvent.slug}" style="display:inline-block; margin-top:8px; padding:6px 12px; background:#0891b2; color:#fff; text-decoration:none; border-radius:4px; font-size:11px; font-weight:bold;">📅 Schedule a Meeting with me</a></td></tr></table>`;
                        navigator.clipboard.writeText(snippet);
                        setCopiedSnippet('signature');
                        setTimeout(() => setCopiedSnippet(null), 2000);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                    >
                      {copiedSnippet === 'signature' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedSnippet === 'signature' ? 'Copied HTML' : 'Copy Signature HTML'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
