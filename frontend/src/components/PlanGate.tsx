import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, ArrowRight } from 'lucide-react'

type Plan = 'free' | 'pro' | 'enterprise'

interface Props {
  children: ReactNode
  requiredPlan: Plan
  currentPlan: Plan
  reportsUsed?: number
  reportsLimit?: number
}

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, enterprise: 2 }

const PLAN_COPY: Record<Plan, { title: string; desc: string; cta: string; price: string }> = {
  pro:        { title: "You've reached your free limit",     desc: 'Upgrade to Pro to continue analyzing reports.', cta: 'Upgrade to Pro', price: 'PKR 1,500 / month' },
  enterprise: { title: 'Enterprise plan required',           desc: 'This feature requires an Enterprise account.',  cta: 'Contact Sales',  price: 'PKR 15,000 / month' },
  free:       { title: 'Upgrade required',                   desc: 'Please upgrade to access this feature.',        cta: 'View Plans',     price: '' },
}

export default function PlanGate({ children, requiredPlan, currentPlan, reportsUsed = 0, reportsLimit = 3 }: Props) {
  const isLocked       = PLAN_RANK[currentPlan] < PLAN_RANK[requiredPlan]
  const isLimitReached = currentPlan === 'free' && reportsLimit !== -1 && reportsUsed >= reportsLimit
  const showOverlay    = isLocked || isLimitReached
  const copy           = PLAN_COPY[requiredPlan]

  return (
    <div className="relative">
      {/* Content — blurred when locked */}
      <div style={{
        filter:        showOverlay ? 'blur(4px)' : 'none',
        pointerEvents: showOverlay ? 'none'      : 'auto',
        userSelect:    showOverlay ? 'none'      : 'auto',
        transition:    'filter 0.3s',
      }}>
        {children}
      </div>

      {/* Lock overlay */}
      <AnimatePresence>
        {showOverlay && (
          <motion.div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl p-6"
            style={{ background: 'rgba(9,18,41,0.85)', backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}>

            <motion.div className="text-center max-w-xs w-full"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{ scale: 0.92,    opacity: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}>

              {/* Floating lock icon */}
              <motion.div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}>
                <Lock size={24} className="text-indigo-400" />
              </motion.div>

              <h3 className="text-white font-bold text-lg mb-2">{copy.title}</h3>
              <p className="text-slate-400 text-sm mb-1 leading-relaxed">{copy.desc}</p>
              {copy.price && (
                <p className="text-indigo-400 text-xs font-semibold mb-5">{copy.price}</p>
              )}

              {/* Usage bar (limit reached, not plan mismatch) */}
              {isLimitReached && !isLocked && (
                <div className="mb-5 text-left">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Reports used this month</span>
                    <span>{reportsUsed} / {reportsLimit}</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: '100%', background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />
                  </div>
                </div>
              )}

              <Link to="/billing"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                {copy.cta} <ArrowRight size={14} />
              </Link>

              {isLimitReached && (
                <p className="text-xs text-slate-600 mt-3">Resets on the 1st of next month</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
