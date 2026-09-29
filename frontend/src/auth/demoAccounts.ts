import type { Role } from '../api/types';

/** Public demo accounts seeded by backend/app/api/auth.py. */
export interface DemoAccount {
  username: string;
  password: string;
  role: Role;
  email: string;
  full_name: string;
  description: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    username: 'farmer',
    password: 'farmer123',
    role: 'Farmer',
    email: 'farmer@yieldsense.ai',
    full_name: 'Ramesh Kumar',
    description: 'Predictions, weather, soil and recommendations for your fields.',
  },
  {
    username: 'agronomist',
    password: 'agro123',
    role: 'Agronomist',
    email: 'agronomist@yieldsense.ai',
    full_name: 'Dr. Sarah Jenkins',
    description: 'Everything a farmer sees, plus EDA, the dataset and model performance.',
  },
  {
    username: 'admin',
    password: 'admin123',
    role: 'Admin',
    email: 'admin@yieldsense.ai',
    full_name: 'System Administrator',
    description: 'Full access, including user and role management.',
  },
];

export function findDemoAccount(username: string, password: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find(a => a.username === username.trim().toLowerCase() && a.password === password);
}
