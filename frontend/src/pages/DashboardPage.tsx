import React, { useState } from 'react';
import { useAuthStore } from '../lib/store';
import { Navbar } from '../components/Navbar';
import { EventTypesList } from '../modules/event-types/EventTypesList';
import { AvailabilityEditor } from '../modules/availability/AvailabilityEditor';
import { EmployeeBookings } from '../modules/bookings/EmployeeBookings';
import { AdminEmployees } from '../modules/admin/AdminEmployees';
import { AdminBookings } from '../modules/admin/AdminBookings';
import { AdminIntegrations } from '../modules/admin/AdminIntegrations';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<string>('event-types');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentTab === 'event-types' && <EventTypesList />}
        {currentTab === 'availability' && <AvailabilityEditor />}
        {currentTab === 'bookings' && <EmployeeBookings />}
        {currentTab === 'admin-employees' && user?.role === 'admin' && <AdminEmployees />}
        {currentTab === 'admin-bookings' && user?.role === 'admin' && <AdminBookings />}
        {currentTab === 'admin-integrations' && user?.role === 'admin' && <AdminIntegrations />}
      </main>
    </div>
  );
};
