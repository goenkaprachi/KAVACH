import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './lib/store';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { DashboardPage } from './pages/DashboardPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { EventTypesPage } from './pages/EventTypesPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { AdminEmployeesPage } from './pages/admin/AdminEmployeesPage';
import { AdminBookingsPage } from './pages/admin/AdminBookingsPage';
import { AdminIntegrationsPage } from './pages/admin/AdminIntegrationsPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { BookingSuccessPage } from './pages/BookingSuccessPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/:username/:slug" element={<PublicBookingPage />} />
          <Route path="/booking-confirmed" element={<BookingSuccessPage />} />

          {/* Protected — nested under AppShell */}
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/meetings" element={<Navigate to="/meetings/upcoming" replace />} />
            <Route path="/meetings/:tab" element={<MeetingsPage />} />
            <Route path="/event-types" element={<EventTypesPage />} />
            <Route path="/availability" element={<AvailabilityPage />} />

            {/* Admin-only */}
            <Route path="/admin/employees" element={<AdminRoute><AdminEmployeesPage /></AdminRoute>} />
            <Route path="/admin/bookings" element={<AdminRoute><AdminBookingsPage /></AdminRoute>} />
            <Route path="/admin/integrations" element={<AdminRoute><AdminIntegrationsPage /></AdminRoute>} />
          </Route>

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
