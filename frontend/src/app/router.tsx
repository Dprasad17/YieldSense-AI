import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../auth/guards';
import type { Permission } from '../auth/permissions';
import { AppShell } from '../components/shell/AppShell';
import { RootLayout } from '../pages/RootLayout';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from '../pages/SystemPages';

function named<T extends Record<string, unknown>>(
  load: () => Promise<T>,
  name: keyof T,
): LazyExoticComponent<ComponentType> {
  return lazy(() => load().then(m => ({ default: m[name] as ComponentType })));
}

const screens = {
  dashboard: named(() => import('../components/MetricCards'), 'MetricCards'),
  predict: named(() => import('../components/YieldPredictor'), 'YieldPredictor'),
  weather: named(() => import('../components/WeatherAnalyticsView'), 'WeatherAnalyticsView'),
  soil: named(() => import('../components/SoilAnalysisView'), 'SoilAnalysisView'),
  recommendations: named(() => import('../components/RecommendationsHubView'), 'RecommendationsHubView'),
  analytics: named(() => import('../components/AnalyticsReportsView'), 'AnalyticsReportsView'),
  data: named(() => import('../components/DataExplorer'), 'DataExplorer'),
  eda: named(() => import('../components/EdaDashboard'), 'EdaDashboard'),
};

const LoginRoute = named(() => import('../pages/LoginRoute'), 'LoginRoute');
const DesignSystemPage = named(() => import('../pages/DesignSystemPage'), 'DesignSystemPage');

function screen(path: string, permission: Permission, Screen: ComponentType) {
  return {
    path,
    element: (
      <ProtectedRoute permission={permission}>
        <Screen />
      </ProtectedRoute>
    ),
  };
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      // The landing page arrives in Phase 6; until then the root goes straight to the app.
      { path: '/', element: <Navigate to="/app/dashboard" replace /> },
      { path: '/login', element: <LoginRoute /> },
      { path: '/403', element: <ForbiddenPage /> },
      { path: '/design-system', element: <DesignSystemPage /> },
      {
        path: '/app',
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              screen('dashboard', 'dashboard', screens.dashboard),
              screen('predict', 'predict', screens.predict),
              screen('weather', 'weather', screens.weather),
              screen('soil', 'soil', screens.soil),
              screen('recommendations', 'recommendations', screens.recommendations),
              screen('analytics', 'analytics', screens.analytics),
              screen('data', 'dataset', screens.data),
              screen('eda', 'eda', screens.eda),
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
