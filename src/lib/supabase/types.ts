// Database types generated from Supabase schema
export type Role = 'admin' | 'user' | 'merchant' | 'accounting';

export interface Profile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  balance?: number;
  total_earnings?: number;
  created_at?: string;
  updated_at?: string;
  referral_code?: string;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  type: 'gcash' | 'bank' | 'maya' | 'gotyme';
  label?: string;
  provider?: string;
  account_name?: string;
  account_number_last4?: string;
  phone?: string;
  qr_code_path?: string;
  is_default: boolean;
  is_public: boolean;
  created_at?: string;
}

export interface Package {
  id: string;
  name: string;
  description: string;
  price: number;
  commission_rate: number;
  level: number;
  max_referrals: number | null;
  maturity_days: number;
  maturity_minutes?: number;
}

export interface UserPackage {
  id: string;
  user_id: string;
  package_id: string;
  status: string;
  activated_at: string | null;
  matures_at: string | null;
  withdrawn_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TopUpRequest {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  status_notes?: string;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
      };
      payment_methods: {
        Row: PaymentMethod;
      };
      packages: {
        Row: Package;
      };
      user_packages: {
        Row: UserPackage;
      };
      top_up_requests: {
        Row: TopUpRequest;
      };
    };
  };
}
