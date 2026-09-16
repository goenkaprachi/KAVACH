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
  Pencil
} from 'lucide-react';

export const EventTypesList: React.FC = () => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Post-creation prompt state
  const [newlyCreatedEvent, setNewlyCreatedEvent] = useState<any | null>(null);

  // Edit Modal State
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDuration, setEditDuration] = useState(30);
  const [editLocationType, setEditLocationType] = useState('jitsi');
  const [editLocationDetail, setEditLocationDetail] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBufferBefore, setEditBufferBefore] = useState(0);
  const [editBufferAfter, setEditBufferAfter] = useState(0);
  const [editMinNotice, setEditMinNotice] = useState(60);

  // Form State
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [duration, setDuration] = useState(30);
  const [locationType, setLocationType] = useState('jitsi');
  const [locationDetail, setLocationDetail] = useState('');
  const [description, setDescription] = useState('');
  const [bufferBefore, setBufferBefore] = useState(0);
  const [bufferAfter, setBufferAfter] = useState(0);
  const [minNotice, setMinNotice] = useState(60);
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
    setDescription('');
    setBufferBefore(0);
    setBufferAfter(0);
    setMinNotice(60);
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
      description,
      buffer_before_minutes: Number(bufferBefore),
      buffer_after_minutes: Number(bufferAfter),
      min_notice_minutes: Number(minNotice),
      custom_questions: toCustomQuestions(bookingFields),
      is_active: true,
    });
  };

  const handleOpenEdit = (et: any) => {
    setEditingEvent(et);
    setEditTitle(et.title || '');
    setEditSlug(et.slug || '');
    setEditDuration(et.duration_minutes || 30);
    setEditLocationType(et.location_type || 'jitsi');
    setEditLocationDetail(et.location_detail || '');
    setEditDescription(et.description || '');
    setEditBufferBefore(et.buffer_before_minutes ?? 0);
    setEditBufferAfter(et.buffer_after_minutes ?? 0);
    setEditMinNotice(et.min_notice_minutes ?? 60);
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
        description: editDescription,
        buffer_before_minutes: Number(editBufferBefore),
        buffer_after_minutes: Number(editBufferAfter),
        min_notice_minutes: Number(editMinNotice),
        custom_questions: toCustomQuestions(editBookingFields),
      },
    });
  };

  const getLocationIcon = (type: string) => {
    switch (type) {
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
        return type.replace('_', ' ');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Meeting Event Types</h1>
          <p className="text-sm text-slate-500">
            Create bookable templates for clients and team members
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
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
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
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
            <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : eventTypes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Clock className="h-12 w-12 text-slate-400 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">No event types created yet</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            Event types are meeting templates like a 15-minute quick chat or 45-minute consultation.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
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
                        <span className="flex items-center space-x-1 capitalize">
                          {getLocationIcon(et.location_type)}
                          <span>{formatLocationName(et.location_type)}</span>
                        </span>
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Create New Event Type</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Event Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 30 Minute Strategy Call"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  URL Slug
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                    /{user?.username}/
                  </span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-r-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Duration (Minutes)
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Location / Platform
                  </label>
                  <select
                    value={locationType}
                    onChange={(e) => setLocationType(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <optgroup label="Video Conferencing (Enabled)">
                      {enabledIntegrations.length > 0 ? (
                        enabledIntegrations.map((item: any) => (
                          <option key={item.provider} value={item.provider}>
                            {item.display_name}
                          </option>
                        ))
                      ) : (
                        <option value="jitsi">Video Call (Web Browser)</option>
                      )}
                    </optgroup>
                    <optgroup label="Other Locations">
                      <option value="phone">Phone Call</option>
                      <option value="in_person">In-Person Meeting</option>
                      <option value="custom">Custom Web Link</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {['phone', 'in_person', 'custom'].includes(locationType) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
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
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Description / Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Share a brief overview of what this meeting is about..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <BookingFieldsEditor fields={bookingFields} onChange={setBookingFields} />

              {/* Advanced Buffers */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                  Buffer & Notice Controls
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Buffer Before</label>
                    <select
                      value={bufferBefore}
                      onChange={(e) => setBufferBefore(Number(e.target.value))}
                      className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={0}>0 min</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Buffer After</label>
                    <select
                      value={bufferAfter}
                      onChange={(e) => setBufferAfter(Number(e.target.value))}
                      className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={0}>0 min</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Min Notice</label>
                    <select
                      value={minNotice}
                      onChange={(e) => setMinNotice(Number(e.target.value))}
                      className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={0}>Immediate</option>
                      <option value={30}>30 min</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={1440}>1 day</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Edit Template</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update meeting parameters, buffers, and booking preferences
                </p>
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Event Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 30 Minute Strategy Call"
                  value={editTitle}
                  onChange={(e) => handleEditTitleChange(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  URL Slug
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-xs font-mono">
                    /{user?.username}/
                  </span>
                  <input
                    type="text"
                    required
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-r-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Duration (Minutes)
                  </label>
                  <select
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Location / Platform
                  </label>
                  <select
                    value={editLocationType}
                    onChange={(e) => setEditLocationType(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <optgroup label="Video Conferencing (Enabled)">
                      {enabledIntegrations.length > 0 ? (
                        enabledIntegrations.map((item: any) => (
                          <option key={item.provider} value={item.provider}>
                            {item.display_name}
                          </option>
                        ))
                      ) : (
                        <option value="jitsi">Video Call (Web Browser)</option>
                      )}
                      {!['phone', 'in_person', 'custom'].includes(editLocationType) &&
                        !enabledIntegrations.some((item: any) => item.provider === editLocationType) && (
                          <option value={editLocationType}>
                            {formatLocationName(editLocationType)} (Currently Disabled)
                          </option>
                        )}
                    </optgroup>
                    <optgroup label="Other Locations">
                      <option value="phone">Phone Call</option>
                      <option value="in_person">In-Person Meeting</option>
                      <option value="custom">Custom Web Link</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {['phone', 'in_person', 'custom'].includes(editLocationType) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
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
                    className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Description / Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="Share a brief overview of what this meeting is about..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <BookingFieldsEditor fields={editBookingFields} onChange={setEditBookingFields} />

              {/* Advanced Buffers */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                  Buffer & Notice Controls
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Buffer Before</label>
                    <select
                      value={editBufferBefore}
                      onChange={(e) => setEditBufferBefore(Number(e.target.value))}
                      className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={0}>0 min</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Buffer After</label>
                    <select
                      value={editBufferAfter}
                      onChange={(e) => setEditBufferAfter(Number(e.target.value))}
                      className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={0}>0 min</option>
                      <option value={5}>5 min</option>
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500">Min Notice</label>
                    <select
                      value={editMinNotice}
                      onChange={(e) => setEditMinNotice(Number(e.target.value))}
                      className="mt-1 block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white"
                    >
                      <option value={0}>Immediate</option>
                      <option value={30}>30 min</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={1440}>1 day</option>
                    </select>
                  </div>
                </div>
              </div>

              {updateMutation.isError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                  {(updateMutation.error as any)?.response?.data?.detail || 'Failed to save changes. Please try again.'}
                </div>
              )}

              <div className="pt-4 flex justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
