import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/env';
import { AppLayout } from '@/components/layout/AppLayout';
import { Spinner } from '@/components/ui';
import LoginPage from '@/features/auth/LoginPage';
import ResetPasswordPage from '@/features/auth/ResetPasswordPage';
import SetupRequired from '@/features/auth/SetupRequired';
import NoAccessPage from '@/features/auth/NoAccessPage';

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const ShipmentsPage = lazy(() => import('@/features/shipments/ShipmentsPage'));
const NewShipmentWizard = lazy(() => import('@/features/shipments/NewShipmentWizard'));
const ShipmentDetailsPage = lazy(() => import('@/features/shipments/ShipmentDetailsPage'));
const ExpensesPage = lazy(() => import('@/features/expenses/ExpensesPage'));
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'));
const LandedCostPage = lazy(() => import('@/features/landed-cost/LandedCostPage'));
const SuppliersPage = lazy(() => import('@/features/suppliers/SuppliersPage'));
const ForwardersPage = lazy(() => import('@/features/forwarders/ForwardersPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const DocumentsPage = lazy(() => import('@/features/documents/DocumentsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

function Protected({ children }: { children: ReactNode }) {
  const { session, loading, role, profile, recovery } = useAuth();
  if (loading) return <Spinner className="min-h-screen" label="Loading your workspace…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (recovery) return <Navigate to="/reset-password" replace />;
  if (profile && !profile.is_active) return <NoAccessPage reason="inactive" />;
  if (!role && profile) return <NoAccessPage reason="norole" />;
  return <>{children}</>;
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <Suspense fallback={<Spinner className="min-h-[60vh]" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="shipments" element={<ShipmentsPage />} />
          <Route path="shipments/new" element={<NewShipmentWizard />} />
          <Route path="shipments/:id" element={<ShipmentDetailsPage />} />
          <Route path="shipments/:id/wizard" element={<NewShipmentWizard />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="landed-cost" element={<LandedCostPage />} />
          <Route path="landed-cost/:id" element={<LandedCostPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="forwarders" element={<ForwardersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
