import type { ComponentType } from 'react';
import {
  BarChart3,
  CloudRain,
  Cpu,
  Database,
  FileText,
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
}

/** Screens that exist today, mapped from the old tab ids. Later phases add the new screens here. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
  { path: 'predict', label: 'Yield Predictor', icon: Cpu, permission: 'predict' },
  { path: 'weather', label: 'Weather', icon: CloudRain, permission: 'weather' },
  { path: 'soil', label: 'Soil', icon: Layers, permission: 'soil' },
  { path: 'recommendations', label: 'Recommendations', icon: Sparkles, permission: 'recommendations' },
  { path: 'analytics', label: 'Analytics & Reports', icon: FileText, permission: 'analytics' },
  { path: 'data', label: 'Dataset Explorer', icon: Database, permission: 'dataset' },
  { path: 'eda', label: 'EDA', icon: BarChart3, permission: 'eda' },
];
