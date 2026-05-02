import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[MediReport AI] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export interface AbnormalValue {
  name: string; value: string; unit: string; normal_range: string
  status: 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH'
}
export interface Profile {
  id: string; full_name: string | null; phone: string | null
  preferred_language: string; role: 'patient' | 'doctor' | 'hospital_admin'
  hospital_id: string | null; created_at: string
}
export interface Subscription {
  id: string; user_id: string; plan: 'free' | 'pro' | 'enterprise'
  reports_used: number; reports_limit: number
  stripe_customer_id: string | null; stripe_subscription_id: string | null
  current_period_end: string | null; created_at: string
}
export interface Report {
  id: string; user_id: string; hospital_id: string | null; image_url: string
  raw_ocr_text: string | null; explanation_en: string | null
  explanation_ur: string | null; explanation_local: string | null
  abnormal_values: AbnormalValue[]; language: string
  pdf_url: string | null; doctor_reviewed: boolean; doctor_notes: string | null
  processing_status: 'pending'|'ocr_processing'|'ai_processing'|'translating'|'completed'|'failed'
  created_at: string
}
export interface Hospital {
  id: string; name: string; subdomain: string; api_key: string
  logo_url: string | null; primary_color: string; languages: string[]
  plan: string; per_report_fee: number; is_active: boolean; created_at: string
}
export interface Database {
  public: { Tables: {
    profiles:      { Row: Profile;      Insert: Omit<Profile,'created_at'>;           Update: Partial<Omit<Profile,'id'|'created_at'>> }
    subscriptions: { Row: Subscription; Insert: Omit<Subscription,'id'|'created_at'>; Update: Partial<Omit<Subscription,'id'|'created_at'>> }
    reports:       { Row: Report;       Insert: Omit<Report,'id'|'created_at'>;       Update: Partial<Omit<Report,'id'|'created_at'>> }
    hospitals:     { Row: Hospital;     Insert: Omit<Hospital,'id'|'created_at'>;     Update: Partial<Omit<Hospital,'id'|'created_at'>> }
  }}
}
export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'medireport-auth' }
})
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}
