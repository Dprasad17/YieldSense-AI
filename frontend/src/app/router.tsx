import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../auth/guards';
import type { Permission } from '../auth/permissions';
import { RootLayout } from '../pages/RootLayout';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from '../pages/SystemPages';

function named<T extends Record<string, unknown>>(
  load: () => Promise<T>,
  name: keyof T,
): LazyExoticComponent<ComponentType> {
  return lazy(() => load().then(m => ({ default: m[name] as ComponentType })));
}

const app = () => import('../pages/app/ExtraPages');
const pub = () => import('../pages/public/AuthPages');

const screens = {
  dashboard: named(() => import('../pages/app/DashboardPage'), 'DashboardPage'),
  predict: named(() => import('../pages/app/PredictorPage'), 'PredictorPage'),
  weather: named(() => import('../pages/app/WeatherPage'), 'WeatherPage'),
  soil: named(() => import('../pages/app/SoilPage'), 'SoilPage'),
  recommendations: named(() => import('../pages/app/RecommendationsPage'), 'RecommendationsPage'),
  analytics: named(() => import('../pages/app/AnalyticsPage'), 'AnalyticsPage'),
  data: named(() => import('../pages/app/DatasetPage'), 'DatasetPage'),
  eda: named(() => import('../pages/app/EdaPage'), 'EdaPage'),
  models: named(app, 'ModelPerformancePage'),
  history: named(app, 'HistoryPage'),
  settings: named(app, 'SettingsPage'),
  help: named(app, 'HelpPage'),
};

const AppShell = named(() => import('../components/shell/AppShell'), 'AppShell');
const LandingPage = named(() => import('../pages/public/LandingPage'), 'LandingPage');
const SignInPage = named(pub, 'SignInPage');
const RegisterPage = named(pub, 'RegisterPage');
const SessionExpiredPage = named(pub, 'SessionExpiredPage');
const PredictionReportPage = named(app, 'PredictionReportPage');
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
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <SignInPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/session-expired', element: <SessionExpiredPage /> },
      { path: '/403', element: <ForbiddenPage /> },
      { path: '/design-system', element: <DesignSystemPage /> },
      {
        path: '/report/prediction',
        element: (
          <ProtectedRoute permission="predict">
            <PredictionReportPage />
          </ProtectedRoute>
        ),
      },
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
              screen('models', 'models', screens.models),
              screen('history', 'history', screens.history),
              screen('settings', 'settings', screens.settings),
              screen('help', 'help', screens.help),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
