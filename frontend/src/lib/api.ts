import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'
import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// Cache for access token to avoid repeated session calls
let cachedToken: string | null = null
let tokenExpiry: number = 0

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 90_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

// Get cached token or fetch new one
async function getAuthToken(): Promise<string | null> {
  // Return cached token if still valid (within 5 minutes)
  const now = Date.now()
  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    return cachedToken
  }
  
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('[API] Session error:', error)
      return null
    }
    
    const token = data.session?.access_token ?? null
    if (token) {
      cachedToken = token
      // Cache until session expires (or max 1 hour)
      tokenExpiry = data.session?.expires_at 
        ? data.session.expires_at * 1000 
        : now + 60 * 60 * 1000
    }
    return token
  } catch (err) {
    console.error('[API] Failed to get session:', err)
    return null
  }
}

// Clear token cache
export function clearAuthCache() {
  cachedToken = null
  tokenExpiry = 0
}

// Request interceptor with token caching
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip auth for public endpoints
    const publicEndpoints = ['/auth/login', '/auth/register', '/billing/plans', '/health']
    const isPublic = publicEndpoints.some(endpoint => config.url?.includes(endpoint))
    
    if (!isPublic) {
      const token = await getAuthToken()
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    
    return config
  },
  (error: AxiosError) => Promise.reject(error)
)

export interface PlanLimitError {
  error: 'limit_exceeded'
  message: string
  current: number
  limit: number
  plan: string
  upgrade_url: string
}

export interface ApiError { 
  detail: string | PlanLimitError
  status?: string 
}

// Response interceptor with improved error handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiError>) => {
    const status = error.response?.status
    const errorData = error.response?.data
    
    switch (status) {
      case 401:
        // Clear cache and sign out
        clearAuthCache()
        await supabase.auth.signOut()
        
        // Don't redirect if already on auth pages
        const isAuthPage = window.location.pathname.includes('/login') || 
                          window.location.pathname.includes('/register')
        if (!isAuthPage) {
          toast.error('Session expired. Please log in again.')
          setTimeout(() => { 
            window.location.href = '/login' 
          }, 1500)
        }
        break
        
      case 403:
        const detail = errorData?.detail
        if (detail && typeof detail === 'object' && detail.error === 'limit_exceeded') {
          toast.error(detail.message ?? 'Plan limit reached. Upgrade to continue.', { 
            duration: 5000, 
            icon: '🔒' 
          })
        } else {
          toast.error('Access denied.')
        }
        break
        
      case 404:
        // Don't show toast for 404s, let component handle it
        break
        
      case 422:
        const message = typeof errorData?.detail === 'string' 
          ? errorData.detail 
          : 'Invalid request. Please check your input.'
        toast.error(message)
        break
        
      case 429:
        toast.error('Too many requests. Please slow down.')
        break
        
      default:
        if (status && status >= 500) {
          toast.error('Server error. Please try again later.')
        } else if (!error.response) {
          toast.error('Network error. Check your connection.')
        }
    }
    
    return Promise.reject(error)
  }
)

export interface MeResponse {
  id: string; email: string; full_name: string | null; preferred_language: string
  role: string; hospital_id: string | null; plan: string
  reports_used: number; reports_limit: number; current_period_end: string | null
}
export interface UploadResponse { report_id: string; status: string; message: string }
export interface ReportSummary {
  id: string; processing_status: string; language: string; image_url: string
  pdf_url: string | null; doctor_reviewed: boolean; created_at: string
  has_abnormals: boolean; abnormal_count: number
}
export interface ReportDetail {
  id: string; user_id: string; hospital_id: string | null; image_url: string
  raw_ocr_text: string | null; explanation_en: string | null; explanation_ur: string | null
  explanation_local: string | null; abnormal_values: Array<{name:string;value:string;unit:string;normal_range:string;status:string}>
  language: string; pdf_url: string | null; doctor_reviewed: boolean
  doctor_notes: string | null; processing_status: string; created_at: string
  audio_url_ur: string | null; audio_url_en: string | null
}
export interface PaginatedReports { reports: ReportSummary[]; total: number; page: number; pages: number; limit: number }
export interface UsageResponse { plan:string; reports_used:number; reports_limit:number; percentage_used:number; remaining:number; reset_date:string }
export interface Plan { id:string; name:string; name_ur:string; price_pkr:number; price_usd:number; reports_limit:number; features:string[]; features_ur:string[]; popular:boolean; cta:string }

export const authApi = {
  register: (d:{email:string;password:string;full_name:string;language:string}) => api.post('/auth/register', d),
  login: (d:{email:string;password:string}) => api.post<{user:MeResponse;access_token:string;expires_at:string}>('/auth/login', d),
  me: () => api.get<MeResponse>('/auth/me'),
  logout: () => api.post('/auth/logout'),
}
export const reportsApi = {
  upload: (formData:FormData) => api.post<UploadResponse>('/reports/upload', formData, { headers:{'Content-Type':'multipart/form-data'}, timeout:120_000 }),
  list: (page=1,limit=10) => api.get<PaginatedReports>(`/reports/?page=${page}&limit=${limit}`),
  get: (id:string) => api.get<ReportDetail>(`/reports/${id}`),
  delete: (id:string) => api.delete(`/reports/${id}`),
}
export const billingApi = {
  plans: () => api.get<{plans:Plan[]}>('/billing/plans'),
  subscribe: (plan_id:string) => api.post<{checkout_url:string;session_id:string}>('/billing/subscribe',{plan_id}),
  usage: () => api.get<UsageResponse>('/billing/usage'),
}
export const hospitalApi = {
  register: (d:{name:string;subdomain:string;logo_url?:string;languages:string[]}) => api.post('/hospital/register',d),
  dashboard: () => api.get('/hospital/dashboard'),
  analytics: () => api.get('/hospital/analytics'),
  bulkUpload: (formData:FormData) => api.post('/hospital/bulk-upload', formData, { headers:{'Content-Type':'multipart/form-data'}, timeout:300_000 }),
}
