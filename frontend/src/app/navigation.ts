import type { ComponentType } from 'react';
import {
  BarChart3,
  CloudRain,
  Cpu,
  Database,
  FileText,
  Gauge,
  HelpCircle,
  History,
  Settings,
  LayoutDashboard,
  Layers,
  Sparkles,
  type LucideProps,
} from 'lucide-react';
import type { Permission } from '../auth/permissions';

export interface NavItem {
  /** Path segment under /app. */
  path: string;
  label: string;
  icon: ComponentType<LucideProps>;
  permission: Permission;
  /** Extra words the command palette matches on. */
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar groups. Only screens that exist are listed; later phases add more. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        path: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        permission: 'dashboard',
        keywords: 'home kpi overview',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        path: 'predict',
        label: 'Yield Predictor',
        icon: Cpu,
        permission: 'predict',
        keywords: 'forecast model predict',
      },
      {
        path: 'weather',
        label: 'Weather',
        icon: CloudRain,
        permission: 'weather',
        keywords: 'rain temperature climate open-meteo',
      },
      { path: 'soil', label: 'Soil', icon: Layers, permission: 'soil', keywords: 'ph moisture ndvi' },
      {
        path: 'recommendations',
        label: 'Recommendations',
        icon: Sparkles,
        permission: 'recommendations',
        keywords: 'ai advice actions',
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        path: 'analytics',
        label: 'Analytics & Reports',
        icon: FileText,
        permission: 'analytics',
        keywords: 'export csv trends report',
      },
      {
        path: 'eda',
        label: 'EDA',
        icon: BarChart3,
        permission: 'eda',
        keywords: 'exploratory distribution correlation',
      },
    ],
  },
  {
    label: 'Data',
    items: [
      {
        path: 'data',
        label: 'Dataset Explorer',
        icon: Database,
        permission: 'dataset',
        keywords: 'records table rows',
      },
      { path: 'history', label: 'Recent predictions', icon: History, permission: 'history', keywords: 'saved history' },
    ],
  },
  {
    label: 'System',
    items: [
      {
        path: 'models',
        label: 'Model performance',
        icon: Gauge,
        permission: 'models',
        keywords: 'r2 rmse mae accuracy',
      },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(g => g.items);

/** Shown at the bottom of the sidebar. */
export const FOOTER_ITEMS: readonly NavItem[] = [
  {
    path: 'settings',
    label: 'Settings',
    icon: Settings,
    permission: 'settings',
    keywords: 'profile preferences theme units',
  },
  { path: 'help', label: 'Help', icon: HelpCircle, permission: 'help', keywords: 'faq glossary shortcuts support' },
];

export const ALL_NAV_ITEMS: readonly NavItem[] = [...NAV_ITEMS, ...FOOTER_ITEMS];
