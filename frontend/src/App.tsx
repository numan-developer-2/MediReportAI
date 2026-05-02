import { Suspense, lazy, useEffect, memo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Navbar from '@/components/Navbar'
import { useAuthStore } from '@/store/useAuthStore'

// Lazy-loaded pages for code splitting with prefetching
const Landing = lazy(() => import('@/pages/Landing'))
const Login = lazy(() => import('@/pages/Login'))
const Register = lazy(() => import('@/pages/Register'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Upload = lazy(() => import('@/pages/Upload'))
const Result = lazy(() => import('@/pages/Result'))
const History = lazy(() => import('@/pages/History'))
const Billing = lazy(() => import('@/pages/Billing'))
const HospitalAdmin = lazy(() => import('@/pages/HospitalAdmin'))

// Prefetch function for route preloading
const prefetchRoute = (route: string) => {
  const prefetchers: Record<string, () => Promise<unknown>> = {
    '/dashboard': () => import('@/pages/Dashboard'),
    '/upload': () => import('@/pages/Upload'),
    '/history': () => import('@/pages/History'),
    '/billing': () => import('@/pages/Billing'),
  }
  const prefetcher = prefetchers[route]
  if (prefetcher) {
    requestIdleCallback(() => {
      prefetcher().catch(() => {/* ignore prefetch errors */})
    })
  }
}

// React Query client - created OUTSIDE component to prevent recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      retryDelay: 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
})

// Optimized page transition variants - use transform only for 60fps
const pageVariants = {
  initial: { opacity: 0, transform: 'translateY(8px)' },
  enter: { 
    opacity: 1, 
    transform: 'translateY(0)',
    transition: { duration: 0.2, ease: 'easeOut' as const }
  },
  exit: { 
    opacity: 0, 
    transform: 'translateY(-4px)',
    transition: { duration: 0.15, ease: 'easeIn' as const }
  },
}

// Ultra-lightweight skeleton using CSS only
const PageSkeleton = memo(function PageSkeleton() {
  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0f172a' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div 
          className="w-8 h-8 rounded-full animate-spin"
          style={{ 
            border: '2px solid rgba(14, 165, 233, 0.2)',
            borderTopColor: '#0ea5e9'
          }}
        />
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    </div>
  )
})

// Optimized page wrapper with hardware acceleration
const PageWrapper = memo(function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div 
      variants={pageVariants} 
      initial="initial" 
      animate="enter" 
      exit="exit"
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  )
})

// Protected route with optimized auth check
const ProtectedRoute = memo(function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) return <PageSkeleton />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  
  // Additional role-based checks can be added here
  return <>{children}</>
})

// Public route - redirects if already logged in
const PublicRoute = memo(function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  
  if (isLoading) return <PageSkeleton />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
})

// Optimized routes wrapper
function AnimatedRoutes() {
  const location = useLocation()
  const { getMe, isAuthenticated, initializeAuth, isInitialized } = useAuthStore()

  // Initialize auth state on app mount
  useEffect(() => {
    let mounted = true
    if (!isInitialized && mounted) {
      initializeAuth().catch(() => {/* ignore */})
    }
    return () => { mounted = false }
  }, [isInitialized, initializeAuth])

  // Refresh user data periodically when authenticated
  useEffect(() => {
    let mounted = true
    if (isAuthenticated && mounted) {
      getMe().catch(() => {/* ignore */})
    }
    return () => { mounted = false }
  }, [isAuthenticated, getMe])

  // Prefetch common routes after initial render
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        prefetchRoute('/upload')
        prefetchRoute('/history')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated])

  const hideNavbar = location.pathname === '/login' || location.pathname === '/register'

  return (
    <>
      {!hideNavbar && <Navbar />}
      
      {/* Use mode="sync" for faster transitions */}
      <AnimatePresence mode="sync" initial={false}>
        <Routes location={location} key={location.pathname}>
          {/* Public Routes */}
          <Route 
            path="/" 
            element={
              <PageWrapper>
                <Suspense fallback={<PageSkeleton />}>
                  <Landing />
                </Suspense>
              </PageWrapper>
            } 
          />
          <Route 
            path="/login" 
            element={
              <PublicRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <Login />
                  </Suspense>
                </PageWrapper>
              </PublicRoute>
            } 
          />
          <Route 
            path="/register" 
            element={
              <PublicRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <Register />
                  </Suspense>
                </PageWrapper>
              </PublicRoute>
            } 
          />

          {/* Protected Routes */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <Dashboard />
                  </Suspense>
                </PageWrapper>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/upload" 
            element={
              <ProtectedRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <Upload />
                  </Suspense>
                </PageWrapper>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/result/:id" 
            element={
              <ProtectedRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <Result />
                  </Suspense>
                </PageWrapper>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/history" 
            element={
              <ProtectedRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <History />
                  </Suspense>
                </PageWrapper>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/billing" 
            element={
              <ProtectedRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <Billing />
                  </Suspense>
                </PageWrapper>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/hospital" 
            element={
              <ProtectedRoute>
                <PageWrapper>
                  <Suspense fallback={<PageSkeleton />}>
                    <HospitalAdmin />
                  </Suspense>
                </PageWrapper>
              </ProtectedRoute>
            } 
          />

          {/* 404 fallback */}
          <Route 
            path="*" 
            element={
              <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
                <div className="text-8xl font-black gradient-text mb-4">404</div>
                <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
                <p className="text-slate-400 mb-8">The page you are looking for does not exist.</p>
                <a href="/" className="btn-primary">Go Home</a>
              </div>
            } 
          />
        </Routes>
      </AnimatePresence>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AnimatedRoutes />
        <Toaster
          position="top-right"
          gutter={8}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '500',
              padding: '12px 16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#f1f5f9' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
            loading: { iconTheme: { primary: '#0ea5e9', secondary: '#f1f5f9' } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
