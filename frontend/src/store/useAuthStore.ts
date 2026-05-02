import { create } from 'zustand'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { authApi, type MeResponse } from '@/lib/api'

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  preferred_language: string
  role: 'patient' | 'doctor' | 'hospital_admin'
  hospital_id: string | null
  plan: 'free' | 'pro' | 'enterprise'
  reports_used: number
  reports_limit: number
}

interface AuthStore {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  isInitialized: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, full_name: string, language?: string) => Promise<void>
  logout: () => Promise<void>
  getMe: () => Promise<void>
  initializeAuth: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  setToken: (token: string | null) => void
  updateLanguage: (lang: string) => void
  incrementReportsUsed: () => void
}

// Apply RTL/LTR direction based on language
function applyDir(lang: string) {
  const isRtl = ['ur', 'ar', 'sd', 'ps'].includes(lang)
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}

// Map API response to AuthUser
function mapMe(me: MeResponse): AuthUser {
  return {
    id: me.id,
    email: me.email,
    full_name: me.full_name,
    preferred_language: me.preferred_language ?? 'ur',
    role: (me.role as AuthUser['role']) ?? 'patient',
    hospital_id: me.hospital_id,
    plan: (me.plan as AuthUser['plan']) ?? 'free',
    reports_used: me.reports_used ?? 0,
    reports_limit: me.reports_limit ?? 3,
  }
}

// Helper: Create a promise with timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), ms)
    )
  ])
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  isAuthenticated: false,
  isInitialized: false,

  // Initialize auth state from Supabase session
  initializeAuth: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('[Auth] Session error:', error)
        set({ isInitialized: true })
        return
      }

      if (session?.user) {
        set({ 
          token: session.access_token,
          isAuthenticated: true 
        })
        // Fetch user data
        try {
          const res = await withTimeout(
            authApi.me(),
            10000,
            'Failed to fetch user data'
          )
          const user = mapMe(res.data)
          set({ user, isAuthenticated: true })
          applyDir(user.preferred_language)
        } catch (err) {
          console.error('[Auth] Failed to fetch user:', err)
          // Still authenticated with Supabase, but no profile
          set({ 
            user: {
              id: session.user.id,
              email: session.user.email!,
              full_name: null,
              preferred_language: 'ur',
              role: 'patient',
              hospital_id: null,
              plan: 'free',
              reports_used: 0,
              reports_limit: 3,
            },
            isAuthenticated: true 
          })
        }
      }
    } catch (err) {
      console.error('[Auth] Initialize error:', err)
    } finally {
      set({ isInitialized: true })
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    
    try {
      // Step 1: Sign in with Supabase directly (v2 syntax)
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        15000,
        'Login request timed out. Please try again.'
      )

      if (authError) {
        throw new Error(authError.message || 'Login failed')
      }

      if (!authData.user || !authData.session) {
        throw new Error('Login failed - no session created')
      }

      // Step 2: Fetch user profile from backend
      let user: AuthUser
      try {
        const res = await withTimeout(
          authApi.me(),
          10000,
          'Failed to fetch user profile'
        )
        user = mapMe(res.data)
      } catch (apiErr) {
        console.warn('[Auth] Backend API unavailable, using basic profile:', apiErr)
        // Fallback to basic user info from Supabase
        user = {
          id: authData.user.id,
          email: authData.user.email!,
          full_name: authData.user.user_metadata?.full_name ?? null,
          preferred_language: authData.user.user_metadata?.preferred_language ?? 'ur',
          role: (authData.user.user_metadata?.role as AuthUser['role']) ?? 'patient',
          hospital_id: authData.user.user_metadata?.hospital_id ?? null,
          plan: 'free',
          reports_used: 0,
          reports_limit: 3,
        }
      }

      set({ 
        user, 
        token: authData.session.access_token, 
        isAuthenticated: true, 
        isLoading: false 
      })
      
      applyDir(user.preferred_language)
      toast.success('Welcome back! 👋', { duration: 3000 })
      
    } catch (err) {
      set({ isLoading: false })
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.'
      toast.error(message)
      throw err
    }
  },

  register: async (email: string, password: string, full_name: string, language = 'ur') => {
    set({ isLoading: true })
    
    try {
      // Step 1: Create user in Supabase Auth directly (v2 syntax)
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name,
              preferred_language: language,
              role: 'patient',
            },
          },
        }),
        20000,
        'Registration timed out. Please try again.'
      )

      if (authError) {
        // Handle specific Supabase errors
        if (authError.message?.includes('User already registered')) {
          throw new Error('An account with this email already exists. Please sign in.')
        }
        throw new Error(authError.message || 'Registration failed')
      }

      if (!authData.user) {
        throw new Error('Registration failed - user not created')
      }

      // Note: Supabase may require email confirmation
      const needsEmailConfirmation = !authData.session

      // Step 2: Create user profile in backend
      let user: AuthUser
      try {
        const res = await withTimeout(
          authApi.register({ email, password, full_name, language }),
          15000,
          'Failed to create user profile'
        )
        user = mapMe(res.data.user)
        
        set({ 
          user, 
          token: res.data.access_token, 
          isAuthenticated: true, 
          isLoading: false 
        })
      } catch (apiErr) {
        console.warn('[Auth] Backend registration failed, using Supabase data:', apiErr)
        
        // Fallback: Use Supabase session if available
        if (authData.session) {
          user = {
            id: authData.user.id,
            email: authData.user.email!,
            full_name,
            preferred_language: language,
            role: 'patient',
            hospital_id: null,
            plan: 'free',
            reports_used: 0,
            reports_limit: 3,
          }
          set({ 
            user, 
            token: authData.session.access_token, 
            isAuthenticated: true, 
            isLoading: false 
          })
        } else {
          // No session yet (email confirmation required)
          set({ isLoading: false })
          if (needsEmailConfirmation) {
            toast.success('Please check your email to confirm your account!', { duration: 5000 })
            return
          }
          throw new Error('Registration incomplete. Please try again.')
        }
      }

      applyDir(language)
      toast.success('Account created! Welcome to MediReport AI 🩺', { duration: 4000 })
      
    } catch (err) {
      set({ isLoading: false })
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.'
      toast.error(message)
      throw err
    }
  },

  logout: async () => {
    set({ isLoading: true })
    
    try {
      // Call backend logout (non-blocking)
      try {
        await withTimeout(authApi.logout(), 5000, 'Logout API timeout')
      } catch {
        // Ignore backend logout errors
      }
      
      // Always sign out from Supabase
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('[Auth] Supabase signout error:', error)
      }
      
    } catch (err) {
      console.error('[Auth] Logout error:', err)
    } finally {
      // Always clear local state
      set({ 
        user: null, 
        token: null, 
        isAuthenticated: false, 
        isLoading: false 
      })
      document.documentElement.dir = 'ltr'
      document.documentElement.lang = 'en'
      toast.success('Logged out successfully.')
    }
  },

  getMe: async () => {
    if (!get().isAuthenticated) return
    
    try {
      const res = await withTimeout(authApi.me(), 10000, 'Failed to fetch user')
      const user = mapMe(res.data)
      set({ user, isAuthenticated: true })
      applyDir(user.preferred_language)
    } catch (err) {
      console.error('[Auth] getMe error:', err)
      // Don't change auth state on profile fetch failure
    }
  },

  setUser: (user) => set({ user, isAuthenticated: user !== null }),
  
  setToken: (token) => set({ token }),
  
  updateLanguage: (lang: string) => {
    const { user } = get()
    if (user) {
      set({ user: { ...user, preferred_language: lang } })
      applyDir(lang)
    }
  },
  
  incrementReportsUsed: () => {
    const { user } = get()
    if (user) {
      set({ user: { ...user, reports_used: user.reports_used + 1 } })
    }
  },
}))

// Listen to Supabase auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('[Auth] State change:', event)
  
  const store = useAuthStore.getState()
  
  switch (event) {
    case 'SIGNED_IN':
      if (session) {
        useAuthStore.setState({ 
          token: session.access_token,
          isAuthenticated: true 
        })
        if (!store.user) {
          await store.getMe()
        }
      }
      break
      
    case 'TOKEN_REFRESHED':
      if (session) {
        useAuthStore.setState({ token: session.access_token })
      }
      break
      
    case 'SIGNED_OUT':
      useAuthStore.setState({ 
        user: null, 
        token: null, 
        isAuthenticated: false 
      })
      document.documentElement.dir = 'ltr'
      document.documentElement.lang = 'en'
      break
      
    case 'USER_UPDATED':
      if (session?.user) {
        await store.getMe()
      }
      break
  }
})
