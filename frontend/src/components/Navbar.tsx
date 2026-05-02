import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Upload, History, CreditCard, Menu, X,
  ChevronDown, LogOut, User, Building2
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload',    label: 'Upload',    icon: Upload },
  { to: '/history',   label: 'History',   icon: History },
  { to: '/billing',   label: 'Billing',   icon: CreditCard },
]

const LANGS = [
  { code: 'ur', label: 'اردو',    flag: '🇵🇰' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिन्दी',   flag: '🇮🇳' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAuthenticated, updateLanguage } = useAuthStore()

  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)

  const avatarRef = useRef<HTMLDivElement>(null)
  const langRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false)
      if (langRef.current   && !langRef.current.contains(e.target as Node))   setLangOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close mobile on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const handleLogout = async () => {
    setAvatarOpen(false)
    await logout()
    navigate('/login')
  }

  const currentLang = LANGS.find(l => l.code === (user?.preferred_language ?? 'ur')) ?? LANGS[0]
  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U'

  const planColor = { free: '#64748b', pro: '#0ea5e9', enterprise: '#8b5cf6' }[user?.plan ?? 'free'] ?? '#64748b'

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'shadow-lg' : ''}`}
        style={{
          background: scrolled
            ? 'rgba(15, 23, 42, 0.92)'
            : 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}>
        <div className="page-container">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                🩺
              </div>
              <span className="font-black text-white text-lg tracking-tight">
                Medi<span style={{ color: '#0ea5e9' }}>Report</span>
                <span className="text-xs ml-1 font-medium px-1.5 py-0.5 rounded-md text-sky-300 border border-sky-800"
                  style={{ background: 'rgba(14,165,233,0.1)' }}>AI</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            {isAuthenticated && (
              <div className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map(({ to, label, icon: Icon }) => {
                  const active = location.pathname === to
                  return (
                    <Link key={to} to={to}
                      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${active ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                      <Icon size={15} />
                      {label}
                      {active && (
                        <motion.div layoutId="nav-indicator"
                          className="absolute inset-0 rounded-xl"
                          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)' }} />
                      )}
                    </Link>
                  )
                })}
                {user?.role === 'hospital_admin' && (
                  <Link to="/hospital" className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all text-slate-400 hover:text-white hover:bg-white/5`}>
                    <Building2 size={15} /> Hospital
                  </Link>
                )}
              </div>
            )}

            {/* Right Controls */}
            <div className="flex items-center gap-2">
              {/* Language Switcher */}
              <div ref={langRef} className="relative">
                <button onClick={() => setLangOpen(v => !v)} id="lang-switcher"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                  <span>{currentLang.flag}</span>
                  <span className="hidden sm:inline">{currentLang.label}</span>
                  <ChevronDown size={13} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {langOpen && (
                    <motion.div className="absolute right-0 top-full mt-2 w-40 rounded-xl overflow-hidden shadow-2xl"
                      style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)' }}
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}>
                      {LANGS.map(l => (
                        <button key={l.code} onClick={() => { updateLanguage(l.code); setLangOpen(false) }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${l.code === currentLang.code ? 'text-sky-400 bg-sky-500/10' : 'text-slate-300 hover:bg-white/5'}`}>
                          <span>{l.flag}</span>
                          <span>{l.label}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Auth Controls */}
              {isAuthenticated ? (
                <div ref={avatarRef} className="relative">
                  <button onClick={() => setAvatarOpen(v => !v)} id="user-avatar"
                    className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl hover:bg-white/5 transition-all">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                      {initials}
                    </div>
                    <div className="hidden sm:block text-left">
                      <div className="text-sm font-medium text-white leading-none">{user?.full_name?.split(' ')[0] ?? 'User'}</div>
                      <div className="text-xs mt-0.5 font-semibold" style={{ color: planColor }}>
                        {(user?.plan ?? 'free').toUpperCase()}
                      </div>
                    </div>
                    <ChevronDown size={13} className={`text-slate-500 transition-transform ${avatarOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {avatarOpen && (
                      <motion.div className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden shadow-2xl"
                        style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)' }}
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}>
                        {/* User info */}
                        <div className="px-4 py-3 border-b border-slate-700/50">
                          <div className="text-sm font-semibold text-white truncate">{user?.full_name ?? 'User'}</div>
                          <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                        </div>
                        {/* Plan badge */}
                        <div className="px-4 py-2 border-b border-slate-700/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Plan</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ color: planColor, background: `${planColor}15` }}>
                              {(user?.plan ?? 'free').toUpperCase()}
                            </span>
                          </div>
                          <div className="mt-1.5 bg-slate-800 rounded-full h-1.5">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${user?.reports_limit === -1 ? 20 : Math.min(((user?.reports_used ?? 0) / (user?.reports_limit ?? 3)) * 100, 100)}%`, background: planColor }} />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {user?.reports_used ?? 0}/{user?.reports_limit === -1 ? '∞' : user?.reports_limit ?? 3} reports used
                          </p>
                        </div>
                        {/* Links */}
                        {[
                          { to: '/dashboard', icon: User, label: 'Profile' },
                          { to: '/billing',   icon: CreditCard, label: 'Billing' },
                        ].map(({ to, icon: Icon, label }) => (
                          <Link key={to} to={to} onClick={() => setAvatarOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors">
                            <Icon size={15} />{label}
                          </Link>
                        ))}
                        <button onClick={handleLogout} id="logout-btn"
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors">
                          <LogOut size={15} /> Sign out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/login" className="btn-secondary btn-sm hidden sm:inline-flex">Sign In</Link>
                  <Link to="/register" className="btn-primary btn-sm">Get Started</Link>
                </div>
              )}

              {/* Mobile hamburger */}
              {isAuthenticated && (
                <button onClick={() => setMobileOpen(v => !v)} className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all" id="mobile-menu-btn">
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {mobileOpen && isAuthenticated && (
            <motion.div className="md:hidden border-t border-white/5"
              style={{ background: 'rgba(15,23,42,0.98)' }}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}>
              <div className="page-container py-3 space-y-1">
                {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${location.pathname === to ? 'text-white bg-sky-500/10 border border-sky-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    <Icon size={16} />{label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      {/* Spacer */}
      <div className="h-16" />
    </>
  )
}
