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
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-slate-400 mb-4">Please refresh the page to continue</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-sky-500 rounded-lg hover:bg-sky-600 transition-colors"
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
