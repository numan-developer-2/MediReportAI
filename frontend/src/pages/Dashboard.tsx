import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Upload, ArrowRight, TrendingUp, FileText, Globe, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { reportsApi, billingApi } from '@/lib/api'
import type { ReportSummary } from '@/lib/api'

// ── Count-up hook ─────────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) return
    let s = 0
    const step = target / (duration / 16)
    const t = setInterval(() => {
      s += step
      if (s >= target) { setVal(target); clearInterval(t) } else setVal(Math.floor(s))
    }, 16)
    return () => clearInterval(t)
  }, [target])
  return val
}

// ── Animated circular usage ring ─────────────────────────
function UsageRing({ used, limit }: { used: number; limit: number }) {
  const isUnlimited = limit === -1
  const pct = isUnlimited ? 20 : Math.min((used / limit) * 100, 100)
  const r = 52, circ = 2 * Math.PI * r, dash = circ - (pct / 100) * circ
  const color = pct >= 90 ? '#ef4444' : pct >= 66 ? '#f97316' : '#0ea5e9'
  return (
    <div className="relative w-36 h-36 flex-shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: dash }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-black text-white">{used}</span>
        <span className="text-xs text-slate-500">of {isUnlimited ? '∞' : limit}</span>
      </div>
    </div>
  )
}

const LANG_FLAGS: Record<string, string> = {
  ur: '🇵🇰', en: '🇬🇧', hi: '🇮🇳', ar: '🇸🇦', bn: '🇧🇩',
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  completed:      { bg: 'rgba(34,197,94,0.12)',   color: '#4ade80', label: 'Done' },
  pending:        { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', label: 'Queued' },
  ocr_processing: { bg: 'rgba(14,165,233,0.12)',  color: '#38bdf8', label: 'OCR…' },
  ai_processing:  { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8', label: 'AI…' },
  translating:    { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'Translating' },
  failed:         { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', label: 'Failed' },
}

function greet() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }
const fadeUp  = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['reports', 1, 8],
    queryFn:  () => reportsApi.list(1, 8).then(r => r.data),
  })
  const { data: usageData } = useQuery({
    queryKey: ['usage'],
    queryFn:  () => billingApi.usage().then(r => r.data),
  })

  const reports: ReportSummary[] = reportsData?.reports ?? []
  const totalReports  = reportsData?.total ?? 0
  const reportsUsed   = usageData?.reports_used  ?? user?.reports_used  ?? 0
  const reportsLimit  = usageData?.reports_limit ?? user?.reports_limit ?? 3
  const plan          = (usageData?.plan ?? user?.plan ?? 'free') as string
  const resetDate     = usageData?.reset_date ?? ''
  const totalAbnormal = reports.reduce((s, r) => s + (r.abnormal_count ?? 0), 0)
  const langsUsed     = new Set(reports.map(r => r.language)).size

  const countTotal    = useCountUp(totalReports)
  const countAbnormal = useCountUp(totalAbnormal)
  const countLangs    = useCountUp(langsUsed)

  const daysUntilReset = resetDate
    ? Math.max(0, Math.ceil((new Date(resetDate).getTime() - Date.now()) / 86_400_000))
    : 0

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/4 w-96 h-64 opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse,#0ea5e9,transparent 70%)' }} />

      <div className="page-container py-8 max-w-5xl mx-auto">
        <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">

          {/* ── Welcome ── */}
          <motion.div variants={fadeUp}>
            <h1 className="text-3xl font-black text-white">
              {greet()}, <span className="gradient-text">{user?.full_name?.split(' ')[0] ?? 'there'}</span> 👋
            </h1>
            <p className="text-slate-400 mt-1">Here's your health report summary for this month.</p>
          </motion.div>

          {/* ── Usage ring + stat cards ── */}
          <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-4 gap-4">

            {/* Usage ring card */}
            <div className="md:col-span-2 glass p-6 flex items-center gap-6">
              <UsageRing used={reportsUsed} limit={reportsLimit} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white mb-1">
                  {plan === 'enterprise'
                    ? 'Unlimited plan'
                    : `${Math.max(0, reportsLimit - reportsUsed)} reports remaining`}
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  {plan === 'free'
                    ? `Resets in ${daysUntilReset} days`
                    : `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`}
                </p>
                {plan === 'free' && (
                  <Link to="/billing"
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-white"
                    style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                    Upgrade to Pro <ArrowRight size={11} />
                  </Link>
                )}
              </div>
            </div>

            {/* Stat cards */}
            {([
              { icon: FileText,   label: 'Total Reports',   value: countTotal,    color: '#0ea5e9' },
              { icon: TrendingUp, label: 'Abnormals Found', value: countAbnormal, color: '#ef4444' },
              { icon: Globe,      label: 'Languages Used',  value: countLangs,    color: '#8b5cf6' },
            ] as const).map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="glass p-5 flex flex-col justify-between">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div>
                  <div className="text-3xl font-black text-white">{value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </motion.div>

          {/* ── Upgrade banner (near limit) ── */}
          {plan === 'free' && reportsUsed >= reportsLimit - 1 && (
            <motion.div variants={fadeUp}>
              <Link to="/billing"
                className="flex items-center justify-between rounded-2xl p-5 transition-all hover:scale-[1.01]"
                style={{ background: 'linear-gradient(135deg,rgba(14,165,233,0.15),rgba(99,102,241,0.15))', border: '1px solid rgba(99,102,241,0.3)' }}>
                <div>
                  <p className="font-bold text-white">Unlock unlimited reports 🚀</p>
                  <p className="text-sm text-slate-400 mt-0.5">Upgrade to Pro for PKR 1,500/month</p>
                </div>
                <motion.div animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <ArrowRight size={20} className="text-sky-400" />
                </motion.div>
              </Link>
            </motion.div>
          )}

          {/* ── Recent Reports ── */}
          <motion.div variants={fadeUp}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title text-lg">Recent Reports</h2>
              <Link to="/history" className="flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 transition-colors">
                View all <ChevronRight size={14} />
              </Link>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
              </div>
            ) : reports.length === 0 ? (
              <div className="glass p-10 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-slate-400 font-medium">No reports yet</p>
                <p className="text-slate-600 text-sm mt-1">Upload your first lab report to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {reports.map((r, i) => {
                  const st = STATUS_STYLES[r.processing_status] ?? STATUS_STYLES.pending
                  return (
                    <motion.div key={r.id}
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => navigate(`/result/${r.id}`)}
                      className="glass-hover p-4 cursor-pointer rounded-2xl">
                      <div className="w-full h-24 rounded-xl mb-3 overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.04)' }}>
                        {r.image_url
                          ? <img src={r.image_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-2xl">📄</div>}
                      </div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-lg leading-none">{LANG_FLAGS[r.language] ?? '🌐'}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {new Date(r.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                      </p>
                      {(r.abnormal_count ?? 0) > 0 && (
                        <p className="text-xs text-red-400 mt-1 font-medium">⚠ {r.abnormal_count} abnormal</p>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* ── Upload CTA ── */}
          <motion.div variants={fadeUp}>
            <Link to="/upload"
              className="flex items-center justify-between rounded-2xl p-6 transition-all hover:scale-[1.01]"
              style={{ background: 'linear-gradient(135deg,#0c4a6e,#1e1b4b)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(14,165,233,0.2)' }}>
                  <Upload size={22} className="text-sky-400" />
                </div>
                <div>
                  <p className="font-bold text-white text-lg">Analyze a new report</p>
                  <p className="text-slate-400 text-sm">Upload a photo or PDF of your lab results</p>
                </div>
              </div>
              <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
                <ArrowRight size={22} className="text-sky-400" />
              </motion.div>
            </Link>
          </motion.div>

        </motion.div>
      </div>
    </div>
  )
}
