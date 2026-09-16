import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Calendar, Clock, Download, User, Building, Phone } from 'lucide-react';

export const BookingSuccessPage: React.FC = () => {
  const location = useLocation();
  const booking = location.state?.booking;
  const eventType = location.state?.eventType;
  const answers = location.state?.answers || booking?.invitees?.[0]?.custom_answers || {};
  const invitee = booking?.invitees?.[0];

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

  const eventTitle = `${eventType?.title || 'Meeting'} with ${booking.employee_name || 'Host'}`;
  const eventDescriptionLines = [
    'Scheduled via Kavach Connect.',
    booking.meeting_join_url ? `Join link: ${booking.meeting_join_url}` : null,
  ].filter(Boolean);
  const eventDescription = eventDescriptionLines.join('\n');

  const downloadIcs = () => {
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtStart = startDt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtEnd = endDt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
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
      `DESCRIPTION:${eventDescription.replace(/\n/g, '\\n')}`,
      `LOCATION:${booking.meeting_join_url || 'Online'}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'meeting.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Deep link to Google Calendar's "add event" flow, prefilled with the
  // meeting's title, time, and description (including the join link, which
  // is intentionally not shown elsewhere on this page). Google will prompt
  // the visitor to pick/sign in to a Google account before adding it.
  const toGCalDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const googleCalendarUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle,
    dates: `${toGCalDate(startDt)}/${toGCalDate(endDt)}`,
    details: eventDescription,
    location: booking.meeting_join_url || 'Online',
  }).toString()}`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
        <div className="flex justify-center items-center space-x-2">
          <img
            src="/badge.jpg"
            alt="Kavach Connect"
            className="h-9 w-9 rounded-full object-cover shadow-sm border border-amber-900/20"
          />
          <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Kavach Connect</span>
        </div>

        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
            <CheckCircle2 className="h-10 w-10" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            You're Scheduled!
          </h1 >
          <p className="mt-1 text-sm text-slate-500">
            A confirmation email and calendar invitation have been sent to your inbox.
          </p>
        </div>

        {/* Details Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left space-y-3">
          <div className="font-bold text-slate-900 text-base border-b border-slate-200 pb-2">
            {eventType?.title || 'Meeting'} with {booking.employee_name}
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-700 font-medium">
            <Calendar className="h-4 w-4 text-blue-600 flex-shrink-0" />
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

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <a
            href={googleCalendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex justify-center items-center py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-200 transition-colors"
          >
            <Calendar className="mr-2 h-4 w-4" />
            <span>Add to Google Calendar</span>
          </a>

          <button
            onClick={downloadIcs}
            className="w-full flex justify-center items-center py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="mr-2 h-4 w-4 text-slate-500" />
            <span>Add to Calendar (.ics)</span>
          </button>
        </div>

        <p className="text-xs text-slate-400 pt-2">
          The meeting joining link has been included in your confirmation email.
        </p>
      </div>
    </div>
  );
};
