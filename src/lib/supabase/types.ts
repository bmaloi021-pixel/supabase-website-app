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

export interface ProfileInsert {
  id?: string;
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

export interface ProfileUpdate {
  username?: string;
  first_name?: string;
  last_name?: string;
  role?: Role;
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

export interface PaymentMethodInsert {
  id?: string;
  user_id: string;
  type: 'gcash' | 'bank' | 'maya' | 'gotyme';
  label?: string;
  provider?: string;
  account_name?: string;
  account_number_last4?: string;
  phone?: string;
  qr_code_path?: string;
  is_default?: boolean;
  is_public?: boolean;
  created_at?: string;
}

export interface PaymentMethodUpdate {
  user_id?: string;
  type?: 'gcash' | 'bank' | 'maya' | 'gotyme';
  label?: string;
  provider?: string;
  account_name?: string;
  account_number_last4?: string;
  phone?: string;
  qr_code_path?: string;
  is_default?: boolean;
  is_public?: boolean;
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

export interface PackageInsert {
  name: string;
  description: string | null;
  price: number;
  commission_rate: number;
  level: number;
  max_referrals: number | null;
  maturity_days: number;
  maturity_minutes?: number;
}

export interface PackageUpdate {
  name?: string;
  description?: string | null;
  price?: number;
  commission_rate?: number;
  level?: number;
  max_referrals?: number | null;
  maturity_days?: number;
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

export interface UserPackageInsert {
  id?: string;
  user_id: string;
  package_id: string;
  status: string;
  activated_at?: string | null;
  matures_at?: string | null;
  withdrawn_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserPackageUpdate {
  user_id?: string;
  package_id?: string;
  status?: string;
  activated_at?: string | null;
  matures_at?: string | null;
  withdrawn_at?: string | null;
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

export interface TopUpRequestInsert {
  id?: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  status_notes?: string;
  created_at?: string;
}

export interface TopUpRequestUpdate {
  user_id?: string;
  amount?: number;
  status?: 'pending' | 'approved' | 'rejected';
  status_notes?: string;
  created_at?: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  package_id?: string | null;
  status: string;
  commission_earned?: number;
  created_at?: string;
}

export interface ReferralInsert {
  id?: string;
  referrer_id: string;
  referred_id: string;
  package_id?: string | null;
  status: string;
  commission_earned?: number;
  created_at?: string;
}

export interface ReferralUpdate {
  referrer_id?: string;
  referred_id?: string;
  package_id?: string | null;
  status?: string;
  commission_earned?: number;
  created_at?: string;
}

export interface Commission {
  id: string;
  user_id: string;
  referral_id: string;
  top_up_request_id?: string | null;
  amount: number;
  commission_type: string;
  level: number;
  status: string;
  created_at?: string;
}

export interface CommissionInsert {
  id?: string;
  user_id: string;
  referral_id: string;
  top_up_request_id?: string | null;
  amount: number;
  commission_type: string;
  level: number;
  status: string;
  created_at?: string;
}

export interface CommissionUpdate {
  user_id?: string;
  referral_id?: string;
  top_up_request_id?: string | null;
  amount?: number;
  commission_type?: string;
  level?: number;
  status?: string;
  created_at?: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing';
  status_notes?: string | null;
  payment_method_info?: any;
  processed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WithdrawalRequestInsert {
  id?: string;
  user_id: string;
  amount: number;
  status?: 'pending' | 'approved' | 'rejected' | 'processing';
  status_notes?: string | null;
  payment_method_info?: any;
  processed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WithdrawalRequestUpdate {
  user_id?: string;
  amount?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'processing';
  status_notes?: string | null;
  payment_method_info?: any;
  processed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: ProfileUpdate
        Relationships: []
      }
      payment_methods: {
        Row: PaymentMethod
        Insert: PaymentMethodInsert
        Update: PaymentMethodUpdate
        Relationships: []
      }
      packages: {
        Row: Package
        Insert: PackageInsert
        Update: PackageUpdate
        Relationships: []
      }
      user_packages: {
        Row: UserPackage
        Insert: UserPackageInsert
        Update: UserPackageUpdate
        Relationships: []
      }
      top_up_requests: {
        Row: TopUpRequest
        Insert: TopUpRequestInsert
        Update: TopUpRequestUpdate
        Relationships: []
      }
      referrals: {
        Row: Referral
        Insert: ReferralInsert
        Update: ReferralUpdate
        Relationships: []
      }
      commissions: {
        Row: Commission
        Insert: CommissionInsert
        Update: CommissionUpdate
        Relationships: []
      }
      withdrawal_requests: {
        Row: WithdrawalRequest
        Insert: WithdrawalRequestInsert
        Update: WithdrawalRequestUpdate
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_referrer_id_by_code: {
        Args: { code: string }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
