import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, CheckCircle2 } from 'lucide-react'

interface Props {
  name: string
  value: string
  unit: string
  normal_range: string
  status: string
  index?: number
}

type StatusConfig = {
  bg: string
  border: string
  text: string
  badge: string
  icon: React.ReactNode
  label: string
  pulse: boolean
}

function getStatusConfig(status: string): StatusConfig {
  const s = status.toUpperCase()
  if (s === 'CRITICAL_HIGH' || s === 'HIGH') return {
    bg:     'rgba(239,68,68,0.07)',
    border: 'rgba(239,68,68,0.25)',
    text:   '#f87171',
    badge:  'rgba(239,68,68,0.15)',
    icon:   <TrendingUp size={14} />,
    label:  s === 'CRITICAL_HIGH' ? '\u26A0 Critical High' : '\u2191 High',
    pulse:  true,
  }
  if (s === 'CRITICAL_LOW' || s === 'LOW') return {
    bg:     'rgba(249,115,22,0.07)',
    border: 'rgba(249,115,22,0.25)',
    text:   '#fb923c',
    badge:  'rgba(249,115,22,0.15)',
    icon:   <TrendingDown size={14} />,
    label:  s === 'CRITICAL_LOW' ? '\u26A0 Critical Low' : '\u2193 Low',
    pulse:  s === 'CRITICAL_LOW',
  }
  return {
    bg:     'rgba(34,197,94,0.07)',
    border: 'rgba(34,197,94,0.2)',
    text:   '#4ade80',
    badge:  'rgba(34,197,94,0.12)',
    icon:   <CheckCircle2 size={14} />,
    label:  '\u2713 Normal',
    pulse:  false,
  }
}

export default function AbnormalBadge({ name, value, unit, normal_range, status, index = 0 }: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const cfg = getStatusConfig(status)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.06, type: 'spring', stiffness: 200, damping: 18 }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="relative rounded-2xl p-4 cursor-default"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}>

      {/* Test name */}
      <p className="text-xs font-semibold text-slate-400 mb-2 truncate" title={name}>{name}</p>

      {/* Value */}
      <div className="flex items-end gap-1.5 mb-3">
        <span className="text-2xl font-black leading-none" style={{ color: cfg.text }}>
          {value}
        </span>
        <span className="text-xs text-slate-500 mb-0.5">{unit}</span>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: cfg.badge, color: cfg.text }}>
          {/* Pulsing dot for abnormal */}
          {cfg.pulse && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                style={{ background: cfg.text }} />
              <span className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: cfg.text }} />
            </span>
          )}
          {cfg.icon}
          {cfg.label}
        </div>
      </div>

      {/* Tooltip — reference range */}
      <AnimatePresence>
        {tooltipOpen && (
          <motion.div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}>
            <div className="px-3 py-2 rounded-xl text-xs text-center whitespace-nowrap shadow-2xl"
              style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', minWidth: '140px' }}>
              <p className="font-semibold text-white mb-0.5">Normal Range</p>
              <p style={{ color: cfg.text }}>{normal_range || 'N/A'} {unit}</p>
              <p className="text-slate-500 mt-0.5">Your value: {value} {unit}</p>
              {/* Tooltip arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent"
                style={{ borderTopColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
