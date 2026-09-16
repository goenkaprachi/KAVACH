import React, { useState } from 'react';
import { useAuthStore } from '../lib/store';
import { Sidebar } from '../components/Sidebar';
import { WelcomeHeader } from '../components/WelcomeHeader';
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
    <div className="min-h-screen bg-slate-100">
      <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

      <main className="min-h-screen md:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <WelcomeHeader />

          <div className="mt-6">
            {currentTab === 'event-types' && <EventTypesList />}
            {currentTab === 'availability' && <AvailabilityEditor />}
            {currentTab === 'bookings' && <EmployeeBookings />}
            {currentTab === 'admin-employees' && user?.role === 'admin' && <AdminEmployees />}
            {currentTab === 'admin-bookings' && user?.role === 'admin' && <AdminBookings />}
            {currentTab === 'admin-integrations' && user?.role === 'admin' && <AdminIntegrations />}
          </div>
        </div>
      </main>
    </div>
  );
};
