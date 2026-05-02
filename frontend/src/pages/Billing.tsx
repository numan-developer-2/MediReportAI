import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Check, Zap, Crown, Building2, Loader2, Star, Calendar, BarChart3 } from 'lucide-react'
import toast from 'react-hot-toast'
import { billingApi } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'

// ── Plan data ─────────────────────────────────────────────
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    nameUr: 'مفت',
    icon: Star,
    price: { monthly: 0, yearly: 0 },
    reportsLimit: 3,
    color: '#64748b',
    gradient: 'rgba(100,116,139,0.15)',
    border: 'rgba(100,116,139,0.3)',
    popular: false,
    cta: 'Current Plan',
    features: [
      '3 reports per month',
      'Urdu + English',
      'Basic AI explanation',
      'Abnormal value detection',
      'WhatsApp sharing',
    ],
    featuresUr: [
      'ماہانہ 3 رپورٹس',
      'اردو + انگریزی',
      'بنیادی AI وضاحت',
      'غیر معمولی قدروں کی نشاندہی',
      'واٹس ایپ شیئرنگ',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    nameUr: 'پرو',
    icon: Zap,
    price: { monthly: 1500, yearly: 1200 },
    reportsLimit: 30,
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg,rgba(14,165,233,0.15),rgba(99,102,241,0.15))',
    border: 'rgba(14,165,233,0.5)',
    popular: true,
    cta: 'Upgrade to Pro',
    features: [
      '30 reports per month',
      'All 6 languages',
      'Advanced AI explanation',
      'PDF export & download',
      'Full report history',
      'Priority processing',
      'Abnormal value alerts',
    ],
    featuresUr: [
      'ماہانہ 30 رپورٹس',
      'تمام 6 زبانیں',
      'جدید AI وضاحت',
      'PDF ایکسپورٹ',
      'مکمل تاریخ',
      'ترجیحی پروسیسنگ',
      'غیر معمولی الرٹس',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    nameUr: 'انٹرپرائز',
    icon: Building2,
    price: { monthly: 15000, yearly: 12000 },
    reportsLimit: -1,
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(236,72,153,0.15))',
    border: 'rgba(139,92,246,0.4)',
    popular: false,
    cta: 'Contact Sales',
    features: [
      'Unlimited reports',
      'White-label API access',
      'Team & multi-user accounts',
      'Hospital dashboard',
      'Bulk report upload (50 files)',
      'Custom branding',
      'Analytics dashboard',
      'Priority support & SLA',
    ],
    featuresUr: [
      'لامحدود رپورٹس',
      'White-label API',
      'ٹیم اکاؤنٹس',
      'ہسپتال ڈیش بورڈ',
      'بلک اپلوڈ (50 فائلیں)',
      'کسٹم برانڈنگ',
      'تجزیاتی ڈیش بورڈ',
      'ترجیحی سپورٹ',
    ],
  },
]

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }
const fadeUp  = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const } } }

export default function Billing() {
  const { user } = useAuthStore()
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  const { data: usageData } = useQuery({
    queryKey: ['usage'],
    queryFn: () => billingApi.usage().then(r => r.data),
  })

  const subscribeMutation = useMutation({
    mutationFn: (plan_id: string) => billingApi.subscribe(plan_id).then(r => r.data),
    onSuccess: (data) => {
      if (data.checkout_url) window.location.href = data.checkout_url
    },
    onError: () => toast.error('Failed to start checkout. Please try again.'),
    onSettled: () => setLoadingPlan(null),
  })

  const handleUpgrade = (planId: string) => {
    if (planId === 'free') return
    if (planId === 'enterprise') {
      window.open('mailto:sales@medireportai.com?subject=Enterprise Plan', '_blank')
      return
    }
    setLoadingPlan(planId)
    subscribeMutation.mutate(planId)
  }

  const currentPlan = user?.plan ?? 'free'
  const reportsUsed  = usageData?.reports_used  ?? user?.reports_used  ?? 0
  const reportsLimit = usageData?.reports_limit ?? user?.reports_limit ?? 3
  const resetDate    = usageData?.reset_date ?? ''
  const usagePct     = reportsLimit === -1 ? 10 : Math.min((reportsUsed / reportsLimit) * 100, 100)

  const daysLeft = resetDate
    ? Math.max(0, Math.ceil((new Date(resetDate).getTime() - Date.now()) / 86_400_000))
    : 0

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      {/* Ambient */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse,#6366f1,transparent 70%)' }} />

      <div className="page-container py-12 max-w-5xl mx-auto">

        {/* ── Header ── */}
        <motion.div className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
            <Crown size={12} /> Pricing Plans
          </div>
          <h1 className="text-4xl font-black text-white mb-3">
            Choose your <span className="gradient-text">plan</span>
          </h1>
          <p className="text-slate-400 text-lg">Start free, upgrade when you need more reports.</p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 mt-6 p-1 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['monthly', 'yearly'] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)}
                className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all ${billing === b ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                style={billing === b ? { background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' } : {}}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
                {b === 'yearly' && (
                  <span className="absolute -top-3 -right-2 text-xs font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                    -20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Current plan banner ── */}
        <AnimatePresence>
          {currentPlan !== 'free' && (
            <motion.div className="mb-8 rounded-2xl p-5 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg,rgba(14,165,233,0.12),rgba(99,102,241,0.12))', border: '1px solid rgba(14,165,233,0.25)' }}
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(14,165,233,0.2)' }}>
                  <Crown size={18} className="text-sky-400" />
                </div>
                <div>
                  <p className="font-bold text-white">
                    You're on the <span className="text-sky-400">{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</span> plan
                  </p>
                  {resetDate && (
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      <Calendar size={11} /> Renews {new Date(resetDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long' })}
                    </p>
                  )}
                </div>
              </div>
              <span className="badge badge-info">Active</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Plan Cards ── */}
        <motion.div variants={stagger} initial="hidden" animate="visible"
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => {
            const Icon      = plan.icon
            const isCurrent = currentPlan === plan.id
            const isPopular = plan.popular
            const price     = plan.price[billing]
            const isLoading = loadingPlan === plan.id

            return (
              <motion.div key={plan.id} variants={fadeUp}
                className="relative rounded-2xl p-6 flex flex-col transition-all duration-300"
                style={{
                  background:   isPopular ? plan.gradient : 'rgba(255,255,255,0.03)',
                  border:       `1px solid ${isCurrent ? '#22c55e' : isPopular ? plan.border : 'rgba(255,255,255,0.08)'}`,
                  transform:    isPopular ? 'scale(1.04)' : 'scale(1)',
                  boxShadow:    isPopular ? `0 20px 60px ${plan.color}20` : 'none',
                }}
                whileHover={{ y: -4, boxShadow: `0 24px 60px ${plan.color}25` }}>

                {/* Popular badge */}
                {isPopular && (
                  <motion.div className="absolute -top-3.5 left-1/2 -translate-x-1/2"
                    animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                    <span className="text-xs font-black px-3 py-1.5 rounded-full text-white whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', boxShadow: '0 4px 15px rgba(14,165,233,0.4)' }}>
                      ✦ Most Popular
                    </span>
                  </motion.div>
                )}

                {/* Current badge */}
                {isCurrent && (
                  <div className="absolute top-4 right-4">
                    <span className="badge badge-normal text-xs">✓ Current</span>
                  </div>
                )}

                {/* Plan icon + name */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${plan.color}20`, border: `1px solid ${plan.color}30` }}>
                    <Icon size={18} style={{ color: plan.color }} />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-lg">{plan.name}</h3>
                    <p className="text-xs text-slate-500" style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}>
                      {plan.nameUr}
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-black text-white">
                      {price === 0 ? 'Free' : `₨${price.toLocaleString()}`}
                    </span>
                    {price > 0 && <span className="text-slate-500 text-sm mb-1">/month</span>}
                  </div>
                  {billing === 'yearly' && price > 0 && (
                    <p className="text-xs text-emerald-400 mt-1">
                      Save ₨{((plan.price.monthly - price) * 12).toLocaleString()}/year
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {plan.reportsLimit === -1 ? 'Unlimited reports' : `${plan.reportsLimit} reports/month`}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Check size={14} className="mt-0.5 shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <motion.button
                  id={`plan-${plan.id}-btn`}
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrent || isLoading}
                  className={`btn w-full py-3 text-sm font-bold transition-all ${isCurrent ? 'text-slate-500 cursor-default' : 'text-white'}`}
                  style={isCurrent ? {
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.75rem',
                  } : {
                    background: isPopular
                      ? 'linear-gradient(135deg,#0ea5e9,#6366f1)'
                      : `linear-gradient(135deg,${plan.color}cc,${plan.color}88)`,
                    borderRadius: '0.75rem',
                    boxShadow: isPopular ? '0 4px 20px rgba(14,165,233,0.3)' : 'none',
                  }}
                  whileHover={!isCurrent ? { scale: 1.02 } : {}}
                  whileTap={!isCurrent ? { scale: 0.98 } : {}}>
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Processing…
                    </span>
                  ) : isCurrent ? '✓ Current Plan' : plan.cta}
                </motion.button>
              </motion.div>
            )
          })}
        </motion.div>

        {/* ── Usage section ── */}
        <motion.div className="glass p-6"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 size={16} className="text-sky-400" />
            <h2 className="font-bold text-white">This Month's Usage</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Progress */}
            <div className="md:col-span-2">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">Reports used</span>
                <span className="font-semibold text-white">
                  {reportsUsed} / {reportsLimit === -1 ? '∞' : reportsLimit}
                </span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full"
                  style={{
                    background: usagePct >= 90
                      ? 'linear-gradient(90deg,#ef4444,#f97316)'
                      : 'linear-gradient(90deg,#0ea5e9,#6366f1)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePct}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.6 }} />
              </div>
              <p className="text-xs text-slate-600 mt-1.5">
                {reportsLimit === -1
                  ? 'Unlimited — no cap on your plan'
                  : `${Math.max(0, reportsLimit - reportsUsed)} reports remaining`}
              </p>
            </div>
            {/* Reset info */}
            <div className="flex flex-col justify-center">
              {resetDate ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-slate-400 mb-1">
                    <Calendar size={13} /> Resets in
                  </div>
                  <div className="text-2xl font-black text-white">{daysLeft} days</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {new Date(resetDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long' })}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">Resets monthly</div>
              )}
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  )
}
