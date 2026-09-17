import { create } from 'zustand';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  status: 'pending' | 'active' | 'deactivated';
  timezone: string;
  username: string;
  avatar_url?: string;
  phone?: string;
  job_title?: string;
  department?: string;
  office_location?: string;
  employee_code?: string;
  bio?: string;
  google_email?: string;
  google_meet_url?: string;
  has_google_token?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('kavach_user') || 'null'),
  accessToken: localStorage.getItem('kavach_access_token'),
  refreshToken: localStorage.getItem('kavach_refresh_token'),
  isAuthenticated: !!localStorage.getItem('kavach_access_token'),

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('kavach_user', JSON.stringify(user));
    localStorage.setItem('kavach_access_token', accessToken);
    localStorage.setItem('kavach_refresh_token', refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  setUser: (user) => {
    localStorage.setItem('kavach_user', JSON.stringify(user));
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('kavach_user');
    localStorage.removeItem('kavach_access_token');
    localStorage.removeItem('kavach_refresh_token');
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },
}));
