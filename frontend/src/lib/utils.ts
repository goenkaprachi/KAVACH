import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(timeStr: string) {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  return `${formattedHours}:${minutes} ${ampm}`;
}

export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function getAttendeePhone(invitee: any): string | null {
  if (!invitee?.custom_answers) return null;
  const answers = invitee.custom_answers;
  const phoneKeys = [
    'contact no.',
    'contact number',
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'contact',
    'telephone',
    'cell',
  ];
  for (const [key, val] of Object.entries(answers)) {
    if (phoneKeys.includes(key.toLowerCase().trim()) && val) {
      return String(val).trim();
    }
  }
  return null;
}
