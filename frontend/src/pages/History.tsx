import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, Download, Trash2, Search, Upload, AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { reportsApi } from '@/lib/api'
import type { ReportSummary } from '@/lib/api'

const LANG_FLAGS: Record<string, string> = {
  ur: '🇵🇰', en: '🇬🇧', hi: '🇮🇳', ar: '🇸🇦', bn: '🇧🇩',
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  completed:      { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', label: 'Completed' },
  failed:         { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', label: 'Failed' },
  pending:        { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', label: 'Pending' },
  ocr_processing: { bg: 'rgba(14,165,233,0.12)',  color: '#38bdf8', label: 'OCR…' },
  ai_processing:  { bg: 'rgba(99,102,241,0.12)',  color: '#818cf8', label: 'AI…' },
  translating:    { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'Translating' },
}

function ConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <motion.div className="relative z-10 glass p-6 max-w-sm w-full rounded-2xl"
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(239,68,68,0.15)' }}>
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div>
            <p className="font-bold text-white">Delete Report?</p>
            <p className="text-xs text-slate-500">This cannot be undone.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel}  className="btn-secondary flex-1 btn-sm">Cancel</button>
          <button onClick={onConfirm} className="btn-danger   flex-1 btn-sm">Delete</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

type FilterType = 'all' | 'month' | 'abnormal'

export default function History() {
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState<FilterType>('all')
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const LIMIT = 10

  const { data, isLoading } = useQuery({
    queryKey: ['reports', page, LIMIT],
    queryFn:  () => reportsApi.list(page, LIMIT).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportsApi.delete(id),
    onSuccess: (_, id) => {
      setDeletedIds(prev => new Set(prev).add(id))
      qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success('Report deleted.')
    },
    onError: () => toast.error('Delete failed. Try again.'),
    onSettled: () => setDeletingId(null),
  })

  const handleDelete = (id: string) => {
    setConfirmId(null)
    setDeletingId(id)
    deleteMutation.mutate(id)
  }

  // Client-side filter
  let rows: ReportSummary[] = (data?.reports ?? []).filter(r => !deletedIds.has(r.id))
  if (filter === 'month') {
    const ago = new Date(); ago.setDate(ago.getDate() - 30)
    rows = rows.filter(r => new Date(r.created_at) >= ago)
  }
  if (filter === 'abnormal') rows = rows.filter(r => r.has_abnormals)
  if (search.trim()) {
    const q = search.toLowerCase()
    rows = rows.filter(r => r.language.toLowerCase().includes(q) || r.id.includes(q))
  }

  const totalPages = data?.pages ?? 1

  return (
    <div className="min-h-screen" style={{ background: '#0f172a' }}>
      <div className="page-container py-8 max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-black text-white">Report History</h1>
            <p className="text-slate-400 text-sm mt-1">All your uploaded lab reports</p>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search reports…"
                className="input pl-10 h-10 text-sm" />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(['all', 'month', 'abnormal'] as FilterType[]).map(f => (
                <button key={f}
                  onClick={() => { setFilter(f); setPage(1) }}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all
                    ${filter === f ? 'text-white' : 'text-slate-400 border-slate-700 hover:border-slate-500'}`}
                  style={filter === f
                    ? { background: 'rgba(14,165,233,0.15)', borderColor: 'rgba(14,165,233,0.4)' }
                    : {}}>
                  {{ all: 'All', month: 'This Month', abnormal: 'Abnormal Only' }[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Table Card */}
          <div className="glass overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Date', 'Preview', 'Language', 'Status', 'Abnormals', 'Actions'].map(h => (
                      <th key={h}
                        className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {isLoading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i}>
                          {[80, 40, 30, 60, 40, 80].map((w, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <div className="text-4xl mb-3">📋</div>
                          <p className="text-slate-400 font-medium mb-1">No reports found</p>
                          <p className="text-slate-600 text-sm mb-5">
                            {filter !== 'all' ? 'Try changing the filter' : 'Upload your first lab report'}
                          </p>
                          <button onClick={() => navigate('/upload')} className="btn-primary btn-sm gap-2">
                            <Upload size={14} /> Upload Report
                          </button>
                        </td>
                      </tr>
                    ) : rows.map((r, i) => {
                      const st         = STATUS_STYLES[r.processing_status] ?? STATUS_STYLES.pending
                      const isDeleting = deletingId === r.id
                      return (
                        <motion.tr key={r.id} layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: isDeleting ? 0.4 : 1, x: 0 }}
                          exit={{ opacity: 0, x: 40 }}
                          transition={{ duration: i < 5 ? 0.25 + i * 0.04 : 0.2 }}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                          {/* Date */}
                          <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                            {new Date(r.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </td>

                          {/* Preview */}
                          <td className="px-4 py-3" onClick={() => navigate(`/result/${r.id}`)}>
                            <div className="w-10 h-10 rounded-lg overflow-hidden cursor-pointer"
                              style={{ background: 'rgba(255,255,255,0.05)' }}>
                              {r.image_url
                                ? <img src={r.image_url} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-base">📄</div>}
                            </div>
                          </td>

                          {/* Language */}
                          <td className="px-4 py-3 text-xl leading-none">{LANG_FLAGS[r.language] ?? '🌐'}</td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: st.bg, color: st.color }}>{st.label}</span>
                          </td>

                          {/* Abnormals */}
                          <td className="px-4 py-3">
                            {(r.abnormal_count ?? 0) > 0
                              ? <span className="text-xs font-bold text-red-400">⚠ {r.abnormal_count}</span>
                              : <span className="text-xs text-emerald-400">✓ None</span>}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <motion.button title="View"
                                onClick={() => navigate(`/result/${r.id}`)}
                                className="p-2 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-all"
                                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Eye size={14} />
                              </motion.button>
                              {r.pdf_url && (
                                <motion.a title="Download PDF" href={r.pdf_url} target="_blank" rel="noreferrer"
                                  className="p-2 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                  <Download size={14} />
                                </motion.a>
                              )}
                              <motion.button title="Delete" disabled={isDeleting}
                                onClick={() => setConfirmId(r.id)}
                                className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Trash2 size={14} />
                              </motion.button>
                            </div>
                          </td>
                        </motion.tr>
                      )
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <p className="text-xs text-slate-500">
                  Page {page} of {totalPages} · {data?.total ?? 0} total
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all">
                    <ChevronLeft size={16} />
                  </button>
                  {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                    const p = i + Math.max(1, page - 2)
                    if (p > totalPages) return null
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-all
                          ${p === page ? 'text-white' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                        style={p === page ? { background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' } : {}}>
                        {p}
                      </button>
                    )
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Delete confirm dialog */}
      <AnimatePresence>
        {confirmId && (
          <ConfirmDialog
            onConfirm={() => handleDelete(confirmId)}
            onCancel={() => setConfirmId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
