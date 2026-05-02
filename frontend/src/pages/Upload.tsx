import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowRight, ChevronRight, Shield, Zap, Lock } from 'lucide-react'
import ReportUploader from '@/components/ReportUploader'
import { reportsApi } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'

const LANGUAGES = [
  { code: 'ur', label: 'Urdu',    flag: '\uD83C\uDDF5\uD83C\uDDF0', native: '\u0627\u0631\u062F\u0648',    dir: 'rtl' },
  { code: 'en', label: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7', native: 'English', dir: 'ltr' },
  { code: 'hi', label: 'Hindi',   flag: '\uD83C\uDDEE\uD83C\uDDF3', native: '\u0939\u093F\u0928\u094D\u0926\u0940',  dir: 'ltr' },
  { code: 'ar', label: 'Arabic',  flag: '\uD83C\uDDF8\uD83C\uDDE6', native: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', dir: 'rtl' },
]

export default function Upload() {
  const navigate = useNavigate()
  const { incrementReportsUsed, user } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState(user?.preferred_language ?? 'ur')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [done, setDone] = useState(false)

  const handleAnalyze = async () => {
    if (!file) { toast.error('Please select a lab report image first.'); return }
    setIsUploading(true)
    setUploadProgress(0)

    // Fake progress ticks while real upload runs
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 85) { clearInterval(progressInterval); return prev }
        return prev + Math.random() * 12
      })
    }, 400)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', language)

      const res = await reportsApi.upload(formData)
      clearInterval(progressInterval)
      setUploadProgress(100)
      incrementReportsUsed()

      setDone(true)
      toast.success('Report uploaded! AI is analyzing...', { duration: 3000 })

      setTimeout(() => navigate(`/result/${res.data.report_id}`), 600)
    } catch (err: unknown) {
      clearInterval(progressInterval)
      setIsUploading(false)
      setUploadProgress(0)
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (typeof msg === 'string') toast.error(msg)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {!done ? (
        <motion.div key="upload-page"
          className="min-h-screen relative overflow-hidden"
          style={{ background: '#0f172a' }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.4 }}>

          {/* Grid background */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(14,165,233,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.04) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }} />

          {/* Glow orbs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] opacity-20 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, #0ea5e9 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 right-0 w-96 h-96 opacity-10 blur-3xl pointer-events-none"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

          <div className="relative z-10 page-container py-10">

            {/* Breadcrumb */}
            <motion.div className="flex items-center gap-2 text-sm text-slate-500 mb-8"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Link to="/dashboard" className="hover:text-sky-400 transition-colors">Dashboard</Link>
              <ChevronRight size={14} />
              <span className="text-slate-300 font-medium">New Report</span>
            </motion.div>

            {/* Heading */}
            <motion.div className="text-center mb-10"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
                <Zap size={12} className="fill-sky-400" />
                AI-Powered Analysis
              </div>
              <h1 className="text-4xl font-black text-white mb-3">
                Upload Your <span className="gradient-text">Lab Report</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-md mx-auto">
                Get a clear, simple explanation in your language — in seconds.
              </p>
            </motion.div>

            {/* Main card */}
            <motion.div className="max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
              <div className="glass p-6 lg:p-8 space-y-6">

                {/* Plan usage banner */}
                {user && user.plan === 'free' && (
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}>
                    <div>
                      <p className="text-sm font-medium text-slate-300">
                        {user.reports_limit - user.reports_used} free reports remaining
                      </p>
                      <div className="mt-1.5 w-48 h-1.5 bg-slate-700 rounded-full">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min((user.reports_used / user.reports_limit) * 100, 100)}%`,
                            background: user.reports_used >= user.reports_limit ? '#ef4444' : 'linear-gradient(90deg, #0ea5e9, #6366f1)',
                          }} />
                      </div>
                    </div>
                    <Link to="/billing" className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors">
                      Upgrade →
                    </Link>
                  </div>
                )}

                {/* Drop zone */}
                <ReportUploader
                  onFileSelect={setFile}
                  isUploading={isUploading}
                  uploadProgress={uploadProgress}
                />

                {/* Language selector */}
                <div>
                  <p className="text-sm font-semibold text-slate-400 mb-3">
                    Explanation Language
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(lang => (
                      <motion.button key={lang.code}
                        onClick={() => setLanguage(lang.code)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 ${language === lang.code
                          ? 'text-white border-sky-500/50'
                          : 'text-slate-400 border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:text-white'}`}
                        style={language === lang.code ? {
                          background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.2))',
                          borderColor: 'rgba(14,165,233,0.5)',
                        } : {}}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}>
                        <span className="text-lg leading-none">{lang.flag}</span>
                        <span>{lang.label}</span>
                        <span className={`text-xs ${language === lang.code ? 'text-sky-300' : 'text-slate-600'}`}
                          style={{ fontFamily: lang.dir === 'rtl' ? "'Noto Nastaliq Urdu', serif" : 'inherit' }}>
                          {lang.native}
                        </span>
                        {language === lang.code && (
                          <motion.span layoutId="lang-check" className="w-1.5 h-1.5 rounded-full bg-sky-400 ml-1" />
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Analyze button */}
                <motion.button
                  id="analyze-btn"
                  onClick={handleAnalyze}
                  disabled={!file || isUploading}
                  className="btn-primary w-full py-4 text-base gap-3 relative overflow-hidden group"
                  whileHover={file && !isUploading ? { scale: 1.02 } : {}}
                  whileTap={file && !isUploading ? { scale: 0.98 } : {}}>
                  {isUploading ? (
                    <>
                      <div className="absolute inset-0 animate-pulse"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', backgroundSize: '200% 100%' }} />
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Analyzing your report...</span>
                    </>
                  ) : (
                    <>
                      <span>Analyze Report</span>
                      <motion.span
                        className="group-hover:translate-x-1 transition-transform duration-200">
                        <ArrowRight size={18} />
                      </motion.span>
                    </>
                  )}
                </motion.button>

                {/* Privacy note */}
                <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                  <Lock size={11} />
                  <span>Your reports are private, encrypted, and never shared.</span>
                  <Shield size={11} />
                </div>
              </div>

              {/* Tips below card */}
              <motion.div className="mt-6 grid grid-cols-3 gap-4"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                {[
                  { icon: '📷', title: 'Good Lighting', desc: 'Clear, well-lit photo for best OCR results' },
                  { icon: '📄', title: 'Full Report', desc: 'Include all pages of your lab report' },
                  { icon: '⚡', title: 'Fast Results', desc: 'AI analysis ready in 30–60 seconds' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="text-center p-4 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-2xl mb-2">{icon}</div>
                    <div className="text-xs font-semibold text-white mb-1">{title}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <motion.div key="success"
          className="min-h-screen flex items-center justify-center"
          style={{ background: '#0f172a' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="text-center">
            <motion.div className="text-6xl mb-4"
              animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5 }}>
              🎉
            </motion.div>
            <p className="text-white text-xl font-bold">Redirecting to results...</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
