import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { AppShellSkeleton } from '../components/skeleton/Skeleton';

/**
 * Route guard - renders child routes only when authenticated.
 *
 * while loading   → skeleton of the app shell (avoids flash of login page)
 * no user         → redirect to /login
 * authenticated   → renders <Outlet /> (nested routes)
 */
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) return <AppShellSkeleton pathname={pathname} />;

  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
