import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'

const LANGUAGES = [
  { code: 'ur', label: 'اردو',    english: 'Urdu',    flag: '🇵🇰', dir: 'rtl' as const },
  { code: 'en', label: 'English', english: 'English', flag: '🇬🇧', dir: 'ltr' as const },
  { code: 'hi', label: 'हिन्दी',  english: 'Hindi',   flag: '🇮🇳', dir: 'ltr' as const },
  { code: 'ar', label: 'العربية', english: 'Arabic',  flag: '🇸🇦', dir: 'rtl' as const },
  { code: 'bn', label: 'বাংলা',   english: 'Bangla',  flag: '🇧🇩', dir: 'ltr' as const },
]

interface Props {
  /** compact mode: just flag + chevron, no label text */
  compact?: boolean
}

export default function LanguageSwitcher({ compact = false }: Props) {
  const [open, setOpen]      = useState(false)
  const ref                  = useRef<HTMLDivElement>(null)
  const { user, updateLanguage } = useAuthStore()

  const currentCode = user?.preferred_language ?? localStorage.getItem('medireport-lang') ?? 'ur'
  const current     = LANGUAGES.find(l => l.code === currentCode) ?? LANGUAGES[0]

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (lang: typeof LANGUAGES[0]) => {
    setOpen(false)

    // 1. Update Zustand + localStorage
    updateLanguage(lang.code)
    localStorage.setItem('medireport-lang', lang.code)

    // 2. Apply RTL/LTR to document
    document.documentElement.dir  = lang.dir
    document.documentElement.lang = lang.code

    // 3. i18next change (if initialised)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const i18n = (window as any).__i18n
    if (i18n?.changeLanguage) i18n.changeLanguage(lang.code)
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        id="language-switcher-btn"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
        aria-haspopup="listbox"
        aria-expanded={open}>
        <span className="text-lg leading-none">{current.flag}</span>
        {!compact && (
          <span className="hidden sm:inline" style={
            current.dir === 'rtl'
              ? { fontFamily: "'Noto Nastaliq Urdu', serif" }
              : {}
          }>
            {current.label}
          </span>
        )}
        <ChevronDown size={13}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden shadow-2xl z-50"
            style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}>

            {/* Header */}
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Language</p>
            </div>

            {LANGUAGES.map(lang => {
              const isActive = lang.code === currentCode
              return (
                <motion.button
                  key={lang.code}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(lang)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                  style={isActive
                    ? { background: 'rgba(14,165,233,0.1)', color: '#38bdf8' }
                    : { color: '#cbd5e1' }}
                  whileHover={{ background: 'rgba(255,255,255,0.05)' }}>

                  <span className="text-lg leading-none">{lang.flag}</span>

                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-medium leading-tight"
                      style={lang.dir === 'rtl' ? { fontFamily: "'Noto Nastaliq Urdu', serif" } : {}}>
                      {lang.label}
                    </span>
                    <span className="text-xs text-slate-500">{lang.english}</span>
                  </div>

                  {isActive && (
                    <motion.div layoutId="lang-active-dot"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                  )}
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
