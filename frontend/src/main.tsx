import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Error Boundary to prevent app crashes
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MediReport AI] App Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const isMissingEnv = this.state.error?.message?.includes('supabase') ||
        this.state.error?.message?.includes('VITE_SUPABASE') ||
        !import.meta.env.VITE_SUPABASE_URL

      if (isMissingEnv) {
        return (
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '1rem', fontFamily: 'sans-serif' }}>
            <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚙️</div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Configuration Required</h1>
              <p style={{ color: '#94a3b8', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                This deployment is missing required environment variables.
                Please add the following in your <strong style={{ color: '#38bdf8' }}>Vercel → Settings → Environment Variables</strong>:
              </p>
              <div style={{ background: '#1e293b', borderRadius: '0.75rem', padding: '1rem', textAlign: 'left', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: '0.85rem', margin: '0.25rem 0' }}>VITE_SUPABASE_URL</p>
                <p style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: '0.85rem', margin: '0.25rem 0' }}>VITE_SUPABASE_ANON_KEY</p>
                <p style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.85rem', margin: '0.25rem 0' }}>VITE_API_URL</p>
              </div>
              <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
                After saving, click <strong style={{ color: '#38bdf8' }}>Redeploy</strong> in the Vercel deployments tab.
              </p>
            </div>
          </div>
        )
      }

      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', padding: '1rem', fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Something went wrong</h1>
            <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '0.5rem 1.25rem', background: '#0ea5e9', borderRadius: '0.5rem', border: 'none', color: 'white', cursor: 'pointer' }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Preload critical resources
const preloadResources = () => {
  // Preconnect to Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  if (supabaseUrl) {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = new URL(supabaseUrl).origin
    document.head.appendChild(link)
  }
}

preloadResources()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
