// Shared model for configurable "booking intake" fields — the details an
// admin collects from an attendee when they schedule a meeting.

export interface BookingField {
  key: string;
  label: string;
  required: boolean;
  /** Core fields (Name, Email) are always present and always required. */
  core?: boolean;
}

export const CORE_BOOKING_FIELDS: BookingField[] = [
  { key: 'name', label: 'Name', required: true, core: true },
  { key: 'email', label: 'Email id', required: true, core: true },
];

/** Common items admins frequently want to collect, suggested up front. */
export const SUGGESTED_BOOKING_FIELDS: { key: string; label: string }[] = [
  { key: 'company_name', label: 'Company name' },
  { key: 'contact_number', label: 'Contact No.' },
  { key: 'job_title', label: 'Job Title / Designation' },
  { key: 'department', label: 'Department' },
  { key: 'company_website', label: 'Company Website' },
  { key: 'linkedin_profile', label: 'LinkedIn Profile' },
  { key: 'address', label: 'Address / Location' },
  { key: 'attendee_count', label: 'Number of Attendees' },
  { key: 'meeting_agenda', label: 'Meeting Agenda / Topic' },
  { key: 'referral_source', label: 'How did you hear about us?' },
];

export const DEFAULT_BOOKING_FIELDS: BookingField[] = [
  ...CORE_BOOKING_FIELDS,
  { key: 'company_name', label: 'Company name', required: false },
  { key: 'contact_number', label: 'Contact No.', required: false },
];

export const slugifyFieldKey = (label: string): string => {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `field_${Date.now()}`;
};

/** Parse an event type's stored `custom_questions` payload back into editable fields. */
export const parseCustomQuestions = (raw: any): BookingField[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_BOOKING_FIELDS.map((f) => ({ ...f }));
  }

  const parsed = raw
    .map((q: any): BookingField | null => {
      const label = typeof q === 'string' ? q : q.label || q.name || '';
      if (!label.trim()) return null;
      const isCore = CORE_BOOKING_FIELDS.some((c) => c.label === label);
      return {
        key: typeof q === 'object' && q.key ? q.key : slugifyFieldKey(label),
        label,
        required: isCore ? true : !!(typeof q === 'object' && q.required),
        core: isCore,
      };
    })
    .filter((f): f is BookingField => f !== null);

  // Ensure core fields are always present even if legacy data omitted them.
  CORE_BOOKING_FIELDS.forEach((core) => {
    if (!parsed.some((f) => f.label === core.label)) {
      parsed.unshift({ ...core });
    }
  });

  return parsed;
};

/** Convert editable fields back into the payload persisted on the event type. */
export const toCustomQuestions = (fields: BookingField[]) =>
  fields.map((f) => ({ key: f.key, name: f.label, label: f.label, required: f.required }));
