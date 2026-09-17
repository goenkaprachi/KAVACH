import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  CheckCircle2,
  Calendar,
  Clock,
  Download,
  User,
  Building,
  Phone,
  Video,
  Copy,
  Check,
  ExternalLink,
  Info,
  MapPin,
} from 'lucide-react';

export const BookingSuccessPage: React.FC = () => {
  const location = useLocation();
  const booking = location.state?.booking;
  const eventType = location.state?.eventType;
  const answers = location.state?.answers || booking?.invitees?.[0]?.custom_answers || {};
  const invitee = booking?.invitees?.[0];

  const [copiedLink, setCopiedLink] = useState(false);

  if (!booking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">No Booking Details Found</h2>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  const startDt = parseISO(booking.start_time);
  const endDt = parseISO(booking.end_time);

  const isGoogleMeet =
    booking.meeting_provider === 'google_meet' ||
    (booking.meeting_join_url && booking.meeting_join_url.includes('meet.google.com'));

  const providerLabel = isGoogleMeet
    ? 'Google Meet'
    : booking.meeting_join_url?.includes('zoom.us')
    ? 'Zoom'
    : booking.meeting_join_url?.includes('teams.microsoft.com')
    ? 'Microsoft Teams'
    : booking.meeting_provider === 'jitsi' || booking.meeting_join_url?.includes('jit.si')
    ? 'Jitsi Meet'
    : booking.meeting_provider === 'phone'
    ? 'Phone Call'
    : booking.meeting_provider === 'in_person'
    ? 'In Person'
    : 'Video Call';

  // Google Calendar "location" parameter is for venue or platform name,
  // NOT raw meeting URLs (which Google Calendar flags as physical map locations).
  const calendarLocation = isGoogleMeet
    ? 'Google Meet'
    : booking.meeting_provider === 'phone'
    ? 'Phone Call'
    : booking.meeting_provider === 'in_person'
    ? (booking.meeting_join_url || 'In Person')
    : booking.meeting_join_url
    ? `${providerLabel} Video Call`
    : 'Online';

  const isExternal = Boolean(eventType || booking?.event_type_id);
  const eventTitle = isExternal ? 'Meeting with Kavach' : (booking?.title || `${eventType?.title || 'Meeting'} with ${booking.employee_name || 'Host'}`);

  const buildCalendarDetails = () => {
    const lines: string[] = [];
    if (booking.meeting_join_url && booking.meeting_join_url.startsWith('http')) {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`📹 ${providerLabel.toUpperCase()} VIDEO CALL`);
      lines.push(`Join Meeting: ${booking.meeting_join_url}`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('');
    } else if (booking.meeting_provider === 'phone') {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('📞 PHONE CALL');
      lines.push(`Instructions: ${booking.meeting_join_url || 'Host will call Attendee'}`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('');
    } else if (booking.meeting_provider === 'in_person') {
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('🏢 IN-PERSON MEETING');
      lines.push(`Venue / Address: ${booking.meeting_join_url || 'Office location specified by host'}`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('');
    }
    lines.push(`Event: ${eventType?.title || 'Meeting'}`);
    lines.push(`Host: ${booking.employee_name || 'Host'}${booking.employee_email ? ` (${booking.employee_email})` : ''}`);
    if (invitee?.name || invitee?.email) {
      lines.push(`Attendee: ${invitee?.name || 'Guest'} (${invitee?.email || ''})`);
    }
    lines.push('');
    lines.push('Scheduled via Kavach Connect.');
    return lines.join('\n');
  };

  const calendarDetails = buildCalendarDetails();

  const handleCopyLink = () => {
    if (booking.meeting_join_url) {
      navigator.clipboard.writeText(booking.meeting_join_url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const downloadIcs = () => {
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtStart = startDt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtEnd = endDt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kavach Infra Solutions//Kavach Connect//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${booking.id}@kavachconnect.infra`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${eventTitle}`,
      `DESCRIPTION:${calendarDetails.replace(/\n/g, '\\n')}`,
      `LOCATION:${calendarLocation}`,
    ];

    if (booking.meeting_join_url && booking.meeting_join_url.startsWith('http')) {
      icsLines.push(`URL:${booking.meeting_join_url}`);
      icsLines.push(`X-GOOGLE-CONFERENCE:${booking.meeting_join_url}`);
      icsLines.push(`CONFERENCE;VALUE=URI;FEATURE=VIDEO:${booking.meeting_join_url}`);
    }

    icsLines.push('STATUS:CONFIRMED');
    icsLines.push('END:VEVENT');
    icsLines.push('END:VCALENDAR');

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${(eventType?.title || 'meeting').toLowerCase().replace(/\s+/g, '-')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Pre-filled Google Calendar web URL template
  // NOTE: We intentionally omit 'add' (guests) here because passing guests to Google Calendar's
  // web URL template triggers Google's auto-conference feature, which generates a brand-new,
  // conflicting Google Meet room that mismatches the booking's pre-assigned room.
  const toGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const gcalParams: Record<string, string> = {
    action: 'TEMPLATE',
    text: eventTitle,
    dates: `${toGCalDate(startDt)}/${toGCalDate(endDt)}`,
    details: calendarDetails,
    location: calendarLocation,
  };

  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams(gcalParams).toString()}`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            You're Scheduled!
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            A confirmation email and calendar invitation have been sent to your inbox.
          </p>
        </div>

        {/* Details Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left space-y-3">
          <div className="font-bold text-slate-900 text-base border-b border-slate-200 pb-2">
            {isExternal ? 'Meeting with Kavach' : `${eventType?.title || 'Meeting'} with ${booking.employee_name}`}
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-700 font-medium">
            <Calendar className="h-4 w-4 text-cyan-600 flex-shrink-0" />
            <span>{format(startDt, 'EEEE, MMMM dd, yyyy')}</span>
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-700 font-medium">
            <Clock className="h-4 w-4 text-slate-500 flex-shrink-0" />
            <span>
              {format(startDt, 'hh:mm a')} – {format(endDt, 'hh:mm a')}
            </span>
          </div>

          {(invitee?.name || answers['Company name'] || answers['Contact No.'] || Object.keys(answers).length > 0) && (
            <div className="border-t border-slate-200 pt-2.5 space-y-1.5 text-xs text-slate-700">
              {invitee?.name && (
                <div className="flex items-center space-x-2">
                  <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <span><strong>{invitee.name}</strong> ({invitee.email})</span>
                </div>
              )}
              {answers['Company name'] && (
                <div className="flex items-center space-x-2">
                  <Building className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <span>Company: <strong>{answers['Company name']}</strong></span>
                </div>
              )}
              {answers['Contact No.'] && (
                <div className="flex items-center space-x-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  <span>Contact: <strong>{answers['Contact No.']}</strong></span>
                </div>
              )}
              {Object.entries(answers)
                .filter(([k]) => !['Company name', 'Contact No.'].includes(k))
                .map(([k, v]) => (
                  <div key={k} className="flex items-center space-x-2 text-[11px] text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                    <span className="font-semibold text-slate-700">{k}:</span>
                    <span>{String(v)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Video Conference Card */}
        {booking.meeting_join_url && booking.meeting_join_url.startsWith('http') && (
          <div className="bg-gradient-to-br from-cyan-50/80 to-sky-50/80 border border-cyan-200 rounded-xl p-4 text-left space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="h-7 w-7 rounded-lg bg-cyan-600 flex items-center justify-center text-white shadow-xs">
                  <Video className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {providerLabel} Video Call
                  </h3>
                  <p className="text-[11px] text-cyan-800 font-medium">Room pre-assigned & ready</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Ready
              </span>
            </div>

            {/* Room Link Display & Copy */}
            <div className="flex items-center justify-between bg-white border border-cyan-200 rounded-lg px-3 py-2 text-xs">
              <span className="font-mono text-slate-800 truncate max-w-[240px] sm:max-w-[300px]">
                {booking.meeting_join_url}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="ml-2 inline-flex items-center space-x-1 text-cyan-700 hover:text-cyan-900 text-xs font-semibold px-2 py-1 rounded hover:bg-cyan-50 transition-colors flex-shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-cyan-600" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Direct Join Button */}
            <a
              href={booking.meeting_join_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <Video className="h-3.5 w-3.5" />
              <span>Join {providerLabel} Room Now</span>
              <ExternalLink className="h-3 w-3 ml-1 opacity-80" />
            </a>

            {/* Helpful note explaining Google Calendar behavior */}
            {isGoogleMeet && (
              <div className="bg-white/80 border border-cyan-100 rounded-lg p-2.5 flex items-start space-x-2 text-[11px] text-slate-600">
                <Info className="h-4 w-4 text-cyan-600 flex-shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <span className="font-semibold text-slate-800">Calendar Tip: </span>
                  When adding to Google Calendar, your Meet room is included in the event details and the location is set to <em>Google Meet</em>. You do <strong>not</strong> need to click &quot;Add Google Meet video conferencing&quot; inside Google Calendar.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phone Call Card */}
        {booking.meeting_provider === 'phone' && (
          <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/80 border border-emerald-200 rounded-xl p-4 text-left space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Phone Call Meeting
                  </h3>
                  <p className="text-[11px] text-emerald-800 font-medium">Host will call you directly</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Scheduled
              </span>
            </div>
            <div className="bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Instructions: </span>
              <span>{booking.meeting_join_url || 'Host will call you at your provided contact number.'}</span>
            </div>
          </div>
        )}

        {/* In-Person Card */}
        {booking.meeting_provider === 'in_person' && (
          <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/80 border border-amber-200 rounded-xl p-4 text-left space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="h-7 w-7 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-xs">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    In-Person Meeting
                  </h3>
                  <p className="text-[11px] text-amber-800 font-medium">Meeting at venue / office</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Confirmed
              </span>
            </div>
            <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Venue Address: </span>
              <span>{booking.meeting_join_url || 'Office location specified by host'}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-1">
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex justify-center items-center py-3 px-4 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-700 hover:to-sky-700 text-white rounded-xl text-sm font-bold shadow-md shadow-cyan-500/20 transition-all"
          >
            <Calendar className="mr-2 h-4 w-4" />
            <span>Add to Google Calendar</span>
          </a>

          <button
            onClick={downloadIcs}
            className="w-full flex justify-center items-center py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="mr-2 h-4 w-4 text-slate-500" />
            <span>Add to Calendar (.ics)</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 pt-1">
          The meeting joining link and calendar file have also been sent to your email.
        </p>
      </div>
    </div>
  );
};

