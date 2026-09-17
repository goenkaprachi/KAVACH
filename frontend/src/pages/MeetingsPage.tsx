import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { EmployeeBookings } from '../modules/bookings/EmployeeBookings';

export const MeetingsPage: React.FC = () => {
  const { tab } = useParams<{ tab?: string }>();

  if (tab !== 'upcoming' && tab !== 'past') {
    return <Navigate to="/meetings/upcoming" replace />;
  }

  return <EmployeeBookings activeTab={tab} />;
};
