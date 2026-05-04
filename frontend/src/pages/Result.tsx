import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Download, Share2, RefreshCw, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { reportsApi, type ReportDetail } from '@/lib/api'
import ResultCard from '@/components/ResultCard'
import AbnormalBadge from '@/components/AbnormalBadge'

// Skeleton components
function SkeletonCard({ h = 'h-32' }: { h?: string }) {
  return <div className={`skeleton ${h} rounded-2xl w-full`} />
}
function SkeletonLine({ w = 'w-full' }: { w?: string }) {
  return <div className={`skeleton h-4 rounded ${w}`} />
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const cardVariants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

const POLL_INTERVAL = 3500  // ms between status polls

const STATUS_LABELS: Record<string, string> = {
  pending:        'Queued...',
  ocr_processing: 'Reading report...',
  ai_processing:  'AI analyzing...',
  translating:    'Translating...',
  completed:      'Complete',
  failed:         'Processing failed',
}
const STATUS_STEPS: Record<string, number> = {
  pending: 10, ocr_processing: 30, ai_processing: 60, translating: 85, completed: 100, failed: 0,
}

export default function Result() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [report, setReport]       = useState<ReportDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [language, setLanguage]   = useState<'ur' | 'en'>('ur')
  const [imageExpanded, setImageExpanded] = useState(false)
  const [pollProgress, setPollProgress]   = useState(0)
  const [statusLabel, setStatusLabel]     = useState('Processing...')
  const [isComplete, setIsComplete]       = useState(false)

  const fetchReport = useCallback(async (quiet = false) => {
    if (!id) return
    if (!quiet) setIsLoading(true)
    try {
      const res = await reportsApi.get(id)
      const data = res.data
      setReport(data)
      setPollProgress(STATUS_STEPS[data.processing_status] ?? 10)
      setStatusLabel(STATUS_LABELS[data.processing_status] ?? 'Processing...')
      if (data.processing_status === 'completed' || data.processing_status === 'failed') {
        setIsComplete(true)
        setIsLoading(false)
      }
      if (data.language) setLanguage(data.language as 'ur' | 'en')
    } catch {
      if (!quiet) toast.error('Failed to load report.')
      setIsLoading(false)
    }
    if (!quiet) setIsLoading(false)
  }, [id])

  // Initial fetch
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchReport() }, [fetchReport])

  // Polling until complete
  useEffect(() => {
    if (isComplete) return
    const interval = setInterval(() => fetchReport(true), POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [isComplete, fetchReport])

  const handleDownloadPDF = async () => {
    if (!report?.pdf_url) {
      toast.error('PDF not ready yet. Please wait until analysis completes.')
      return
    }
    try {
      const a = document.createElement('a')
      a.href = report.pdf_url
      a.download = `MediReport-${id?.slice(0, 8)}.pdf`
      a.target = '_blank'
      a.click()
      toast.success('PDF download started!')
    } catch { toast.error('Download failed. Try again.') }
  }

  const handleWhatsApp = () => {
    if (!report) return
    const text = encodeURIComponent(
      `*MediReport AI Analysis*\n\n` +
      (report.explanation_ur
        ? `*Urdu:*\n${report.explanation_ur}\n\n`
        : '') +
      (report.explanation_en
        ? `*English:*\n${report.explanation_en}\n\n`
        : '') +
      (report.abnormal_values?.length
        ? `*Abnormal Values:* ${report.abnormal_values.length} found`
        : '*All values normal*') +
      `\n\nPowered by MediReport AI`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  // Format date
  const dateLabel = report?.created_at
    ? new Date(report.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const abnormals = report?.abnormal_values ?? []
  const highs     = abnormals.filter(v => ['HIGH', 'CRITICAL_HIGH'].includes(v.status))
  const lows      = abnormals.filter(v => ['LOW',  'CRITICAL_LOW'].includes(v.status))

  // ── LOADING STATE ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="page-container py-8 space-y-6 max-w-3xl mx-auto">
        <SkeletonLine w="w-48" />
        <SkeletonCard h="h-16" />
        <SkeletonCard h="h-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} h="h-28" />)}
        </div>
      </div>
    )
  }

  // ── PROCESSING STATE ───────────────────────────────────
  if (report && !isComplete) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center page-container">
        <motion.div className="max-w-md w-full text-center"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass p-10">
            <motion.div className="text-6xl mb-6"
              animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
              ⚙️
            </motion.div>
            <h2 className="text-xl font-bold text-white mb-2">AI is processing your report</h2>
            <p className="text-slate-400 text-sm mb-6">{statusLabel}</p>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-2">
              <motion.div className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #0ea5e9, #6366f1)' }}
                animate={{ width: `${pollProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }} />
            </div>
            <p className="text-xs text-slate-600 mb-6">Auto-refreshing every few seconds...</p>
            <button onClick={() => fetchReport()} className="btn-secondary btn-sm gap-2">
              <RefreshCw size={13} /> Refresh Now
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // ── FAILED STATE ───────────────────────────────────────
  if (report?.processing_status === 'failed') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center page-container">
        <div className="max-w-sm w-full text-center glass p-10">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-white mb-2">Processing failed</h2>
          <p className="text-slate-400 text-sm mb-6">
            We couldn't analyze this report. Please try uploading again.
          </p>
          <Link to="/upload" className="btn-primary btn-sm">Try Again</Link>
        </div>
      </div>
    )
  }

  // ── FULL RESULT VIEW ──────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Ambient glow */}
      <div className="fixed top-0 right-0 w-96 h-96 opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

      <div className="page-container py-8 max-w-3xl mx-auto">
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-5">

          {/* ── HEADER BAR ── */}
          <motion.div variants={cardVariants}
            className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/history')}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white">Report Analysis</h1>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                  <Clock size={11} />{dateLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Language toggle */}
              <div className="flex items-center rounded-xl overflow-hidden border border-white/10"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {(['ur', 'en'] as const).map(lang => (
                  <button key={lang} onClick={() => setLanguage(lang)}
                    className={`px-4 py-2 text-sm font-semibold transition-all duration-200 ${language === lang ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    style={language === lang ? {
                      background: 'linear-gradient(135deg, rgba(14,165,233,0.3), rgba(99,102,241,0.3))',
                    } : {}}>
                    {lang === 'ur' ? '\uD83C\uDDF5\uD83C\uDDF0 Urdu' : '\uD83C\uDDEC\uD83C\uDDE7 English'}
                  </button>
                ))}
              </div>

              {/* Download PDF */}
              <motion.button onClick={handleDownloadPDF} id="download-pdf"
                className="btn-primary btn-sm gap-2" whileTap={{ scale: 0.94 }}>
                <Download size={14} /> PDF
              </motion.button>

              {/* WhatsApp */}
              <motion.button onClick={handleWhatsApp} id="share-whatsapp"
                className="btn btn-sm gap-2 text-white text-xs font-semibold"
                style={{ background: '#25d366', borderRadius: '0.75rem', padding: '0.5rem 0.875rem' }}
                whileHover={{ scale: 1.04, background: '#22c55e' }}
                whileTap={{ scale: 0.94 }}>
                <Share2 size={13} /> WhatsApp
              </motion.button>
            </div>
          </motion.div>

          {/* ── ALERT: ABNORMALS SUMMARY ── */}
          {abnormals.length > 0 && (
            <motion.div variants={cardVariants}
              className="flex items-center gap-3 px-5 py-4 rounded-2xl"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-sm font-bold text-red-300">
                  {abnormals.length} abnormal value{abnormals.length !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {highs.length > 0 && `${highs.length} high`}
                  {highs.length > 0 && lows.length > 0 && ', '}
                  {lows.length > 0 && `${lows.length} low`}
                  {' — Please consult your doctor.'}
                </p>
              </div>
            </motion.div>
          )}

          {/* ── SECTION 1: Original Image ── */}
          <motion.div variants={cardVariants} className="glass overflow-hidden">
            <button className="w-full flex items-center justify-between px-5 py-4"
              onClick={() => setImageExpanded(v => !v)}>
              <span className="text-sm font-semibold text-white">📄 Original Report</span>
              <span className="text-slate-500">
                {imageExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </button>
            <AnimatePresence>
              {imageExpanded && report?.image_url && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden border-t border-white/5">
                  <div className="p-5">
                    <img src={report.image_url} alt="Original lab report"
                      className="w-full max-h-96 object-contain rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)' }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── SECTION 2: AI Explanation ── */}
          <motion.div variants={cardVariants}>
            <ResultCard
              explanation_ur={report?.explanation_ur ?? null}
              explanation_en={report?.explanation_en ?? null}
              language={language}
              isLoading={false}
              audio_url_ur={report?.audio_url_ur ?? null}
              audio_url_en={report?.audio_url_en ?? null}
            />
          </motion.div>

          {/* ── SECTION 3: Abnormal Values ── */}
          <motion.div variants={cardVariants}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title text-lg">
                Test Results
                {abnormals.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-red-400">
                    ({abnormals.length} abnormal)
                  </span>
                )}
              </h2>
            </div>

            {abnormals.length === 0 ? (
              <motion.div className="glass p-8 text-center"
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="text-4xl mb-3">✅</div>
                <p className="text-emerald-400 font-bold text-lg">All values within normal range!</p>
                <p className="text-slate-500 text-sm mt-1">No abnormal results detected.</p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {abnormals.map((ab, i) => (
                  <AbnormalBadge key={ab.name + '-' + i} {...ab} index={i} />
                ))}
              </div>
            )}
          </motion.div>

          {/* ── SECTION 4: What to do next ── */}
          <motion.div variants={cardVariants} className="glass p-6">
            <h2 className="text-base font-bold text-white mb-4">📋 What to do next?</h2>
            <div className="space-y-3">
              {[
                { step: '1', icon: '🩺', title: 'Consult your doctor', desc: 'Share this report with your physician, especially if values are abnormal.' },
                { step: '2', icon: '📋', title: 'Download the PDF', desc: 'Save a full PDF copy for your medical records or to show at a clinic.' },
                { step: '3', icon: '🔄', title: 'Monitor over time', desc: 'Re-test after treatment to track improvement in abnormal values.' },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}>
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{icon} {title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-2 text-xs text-slate-600">
              <span>⚠️</span>
              <span>MediReport AI is for informational purposes only and does not replace professional medical advice.</span>
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  )
}
