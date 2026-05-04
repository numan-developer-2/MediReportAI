import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Users, FileText, BarChart3, Settings, Grid3X3,
  ArrowUpRight, ArrowDownRight, Upload, Search, CheckCircle2,
  AlertCircle, Shield, X, Eye, MessageCircle,
  Copy, RefreshCw, Send, Trash2, Plus, Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import { hospitalApi } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'

// ── TYPES ──────────────────────────────────────────────────
interface DashboardStats {
  hospital_name: string;
  hospital_logo?: string;
  patients_today: number;
  reports_processed: number;
  abnormal_rate_percent: number;
  api_calls_this_month: number;
  total_patients: number;
  reports_today: number;
  reports_this_month: number;
  pending_reports: number;
  completed_reports: number;
}

interface AnalyticsData {
  daily_reports: Array<{ date: string; count: number; abnormal_count: number }>;
  top_tests: Array<{ name: string; count: number }>;
  abnormal_percentage: number;
  language_breakdown: Record<string, number>;
  total_reports: number;
  total_patients: number;
}

interface Patient {
  id: string;
  name: string;
  mrn: string;
  report_date: string;
  language: string;
  status: 'completed' | 'pending' | 'reviewed';
  abnormal_count: number;
  report_id: string;
}

interface UploadFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface TeamMember {
  id: string;
  email: string;
  role: 'admin' | 'doctor' | 'staff';
  joined_at: string;
}

// ── ANIMATED COUNTER ───────────────────────────────────────
function AnimatedCounter({ value, duration = 2 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0)
  
  useEffect(() => {
    let start = 0
    const end = value
    const increment = end / (duration * 60)
    const timer = setInterval(() => {
      start += increment
      if (start >= end) {
        setCount(end)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 1000 / 60)
    return () => clearInterval(timer)
  }, [value, duration])
  
  return <span>{count.toLocaleString()}</span>
}

// ── STAT CARD ──────────────────────────────────────────────
function StatCard({ title, value, change, icon: Icon, color, isAnimated = false }: {
  title: string;
  value: number | string;
  change: number;
  icon: React.ElementType;
  color: string;
  isAnimated?: boolean;
}) {
  const isPositive = change > 0
  const numValue = typeof value === 'string' ? parseInt(value) || 0 : value
  
  return (
    <motion.div
      className="glass p-6 flex flex-col justify-between"
      whileHover={{ y: -4, boxShadow: `0 20px 40px ${color}15` }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl transition-colors" style={{ background: `${color}15`, color }}>
          <Icon size={20} />
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold ${isPositive ? 'text-emerald-400' : 'text-slate-500'}`}>
          {isPositive ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
          {Math.abs(change)}%
        </div>
      </div>
      <div>
        <div className="text-3xl font-black text-white mb-1">
          {isAnimated && typeof numValue === 'number' ? <AnimatedCounter value={numValue} /> : value}
        </div>
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</div>
      </div>
    </motion.div>
  )
}

// ── SIDEBAR ────────────────────────────────────────────────
function Sidebar({ activeTab, setActiveTab, hospitalName, hospitalLogo }: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  hospitalName: string;
  hospitalLogo?: string;
}) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Grid3X3 },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'bulk', label: 'Bulk Upload', icon: Upload },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="w-64 min-h-screen bg-slate-900/80 border-r border-white/5 flex flex-col fixed left-0 top-0 z-50">
      {/* Hospital Logo + Name */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 overflow-hidden">
            {hospitalLogo ? (
              <img src={hospitalLogo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Building2 size={20} />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-white truncate">{hospitalName || 'Hospital'}</h2>
            <p className="text-[10px] text-slate-500 uppercase">Admin Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <motion.button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
              style={isActive ? { background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(99,102,241,0.15))' } : {}}
              whileHover={{ x: isActive ? 0 : 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon size={18} />
              {item.label}
              {isActive && (
                <motion.div
                  layoutId="active-indicator"
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400"
                />
              )}
            </motion.button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/5">
        <p className="text-[10px] text-slate-600 text-center">Powered by MediReport AI</p>
      </div>
    </div>
  )
}

// ── PATIENT TABLE ──────────────────────────────────────────
function PatientTable({ patients }: { patients: Patient[] }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  const filtered = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.mrn.includes(search)
    const matchesFilter = filterStatus === 'all' || p.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const handleWhatsApp = (patient: Patient) => {
    const message = encodeURIComponent(`Your report is ready! View it here: https://medireport.ai/r/${patient.report_id}`)
    window.open(`https://wa.me/?text=${message}`, '_blank')
    toast.success('WhatsApp share opened')
  }

  const handleMarkReviewed = () => {
    toast.success('Marked as reviewed')
  }

  return (
    <div className="space-y-4">
      {/* Search + Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
          <input
            type="text"
            placeholder="Search by name or MRN..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-800/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:ring-1 ring-brand-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-xs uppercase font-black text-slate-500 border-b border-white/5">
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Report Date</th>
              <th className="px-6 py-4">Language</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Abnormal</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((patient, i) => (
              <motion.tr
                key={patient.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="hover:bg-brand-500/5 transition-colors group"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-white">
                      {patient.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{patient.name}</div>
                      <div className="text-[10px] text-slate-500">MRN: {patient.mrn}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-400 text-sm">{patient.report_date}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-full bg-white/5 text-slate-300 text-xs">
                    {patient.language === 'ur' ? '🇵🇰 Urdu' : patient.language === 'en' ? '🇬🇧 English' : patient.language}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                    patient.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                    patient.status === 'reviewed' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-amber-500/10 text-amber-500'
                  }`}>
                    {patient.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {patient.abnormal_count > 0 ? (
                    <span className="flex items-center gap-1 text-red-400 text-sm">
                      <AlertCircle size={12} /> {patient.abnormal_count}
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setSelectedPatient(patient)}
                      className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                      title="View Report"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleMarkReviewed(patient.id)}
                      className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                      title="Mark Reviewed"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => handleWhatsApp(patient)}
                      className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-emerald-400"
                      title="Send WhatsApp"
                    >
                      <MessageCircle size={14} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* View Modal */}
      <AnimatePresence>
        {selectedPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedPatient(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass max-w-lg w-full p-6 rounded-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Report Details</h3>
                <button onClick={() => setSelectedPatient(null)} className="p-1 hover:bg-white/5 rounded-lg">
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Patient:</span> <span className="text-white">{selectedPatient.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">MRN:</span> <span className="text-white">{selectedPatient.mrn}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Date:</span> <span className="text-white">{selectedPatient.report_date}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Status:</span> <span className="text-white capitalize">{selectedPatient.status}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Language:</span> <span className="text-white">{selectedPatient.language}</span></div>
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => handleWhatsApp(selectedPatient)}
                  className="flex-1 btn-primary py-2 text-sm"
                >
                  <Send size={14} /> Share via WhatsApp
                </button>
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="btn-secondary py-2 text-sm"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── BULK UPLOAD ────────────────────────────────────────────
function BulkUploadSection() {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [summary, setSummary] = useState<{ processed: number; failed: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    addFiles(dropped)
  }

  const addFiles = (newFiles: File[]) => {
    const uploadFiles: UploadFile[] = newFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      size: f.size,
      progress: 0,
      status: 'uploading'
    }))
    setFiles(prev => [...prev, ...uploadFiles])
    
    // Simulate upload progress
    uploadFiles.forEach(file => {
      simulateUpload(file.id)
    })
  }

  const simulateUpload = (fileId: string) => {
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, progress: 100, status: Math.random() > 0.1 ? 'completed' : 'failed', error: Math.random() > 0.1 ? undefined : 'Failed to process' } : f
        ))
        updateSummary()
      } else {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, progress } : f
        ))
      }
    }, 200)
  }

  const updateSummary = () => {
    setTimeout(() => {
      setFiles(prev => {
        const completed = prev.filter(f => f.status === 'completed').length
        const failed = prev.filter(f => f.status === 'failed').length
        if (completed + failed === prev.length && prev.length > 0) {
          setSummary({ processed: completed, failed })
        }
        return prev
      })
    }, 500)
  }

  const retryFailed = () => {
    const failed = files.filter(f => f.status === 'failed')
    failed.forEach(file => {
      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'uploading', progress: 0, error: undefined } : f))
      simulateUpload(file.id)
    })
    setSummary(null)
  }

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'completed'))
    setSummary(null)
  }

  const overallProgress = files.length > 0
    ? files.reduce((acc, f) => acc + f.progress, 0) / files.length
    : 0

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <motion.div
        className={`relative rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          isDragging ? 'border-sky-400 bg-sky-400/5' : 'border-white/10 bg-slate-800/30'
        }`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        whileHover={{ borderColor: 'rgba(14,165,233,0.5)' }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)) }}
        />
        <div className="w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center mx-auto mb-4">
          <Upload size={28} className="text-sky-400" />
        </div>
        <p className="text-white font-semibold mb-2">Drop multiple files here</p>
        <p className="text-slate-500 text-sm mb-4">or click to browse (up to 50 files)</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="btn-secondary text-sm"
        >
          Select Files
        </button>
      </motion.div>

      {/* Progress Ring */}
      {files.length > 0 && (
        <div className="glass p-6 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg className="w-full h-full -rotate-90">
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <motion.circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={226}
                  strokeDashoffset={226 - (226 * overallProgress) / 100}
                  initial={{ strokeDashoffset: 226 }}
                  animate={{ strokeDashoffset: 226 - (226 * overallProgress) / 100 }}
                  transition={{ duration: 0.5 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-white">{Math.round(overallProgress)}%</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{files.filter(f => f.status === 'completed').length} of {files.length} completed</p>
              <p className="text-slate-500 text-sm">{files.filter(f => f.status === 'uploading').length} processing</p>
            </div>
            {summary && (
              <div className="text-right">
                <p className="text-emerald-400 font-bold">{summary.processed} processed</p>
                {summary.failed > 0 && <p className="text-red-400 text-sm">{summary.failed} failed</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold text-white">Upload Queue</h3>
            <div className="flex gap-2">
              {summary && summary.failed > 0 && (
                <button onClick={retryFailed} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                  <RefreshCw size={12} /> Retry Failed
                </button>
              )}
              <button onClick={clearCompleted} className="text-xs text-slate-500 hover:text-white">
                Clear Completed
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {files.map(file => (
              <div key={file.id} className="p-4 border-b border-white/5 last:border-0 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{file.name}</p>
                  <p className="text-slate-500 text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div className="w-32">
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        file.status === 'failed' ? 'bg-red-500' :
                        file.status === 'completed' ? 'bg-emerald-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right">
                  {file.status === 'completed' && <CheckCircle2 size={16} className="text-emerald-500 inline" />}
                  {file.status === 'failed' && <AlertCircle size={16} className="text-red-500 inline" />}
                  {file.status === 'uploading' && <span className="text-xs text-slate-500">{Math.round(file.progress)}%</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 rounded-xl text-center"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={24} className="text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">Upload Complete!</h3>
          <p className="text-slate-400 text-sm mb-4">
            {summary.processed} reports processed successfully
            {summary.failed > 0 && `, ${summary.failed} failed`}
          </p>
          {summary.failed > 0 && (
            <button onClick={retryFailed} className="btn-primary text-sm">
              <RefreshCw size={14} /> Retry Failed
            </button>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ── SETTINGS SECTION ──────────────────────────────────────
function SettingsSection({ stats }: { stats?: DashboardStats }) {
  const [activeColor, setActiveColor] = useState('#0ea5e9')
  const [hospitalName, setHospitalName] = useState(stats?.hospital_name || '')
  const [apiKey, setApiKey] = useState('••••••••••••••••••••••••••••••••')
  const [showApiKey, setShowApiKey] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { id: '1', email: 'admin@hospital.com', role: 'admin', joined_at: '2024-01-15' },
    { id: '2', email: 'dr.ahmed@hospital.com', role: 'doctor', joined_at: '2024-02-20' },
  ])
  const [inviteEmail, setInviteEmail] = useState('')

  const colors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

  const handleCopyApiKey = () => {
    navigator.clipboard.writeText('test-api-key-12345')
    toast.success('API key copied to clipboard')
  }

  const handleRegenerateApiKey = () => {
    toast.success('API key regenerated')
    setApiKey('••••••••••••••••••••••••••••••••')
  }

  const handleInvite = () => {
    if (!inviteEmail) return
    toast.success(`Invitation sent to ${inviteEmail}`)
    setTeamMembers(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      email: inviteEmail,
      role: 'staff',
      joined_at: new Date().toISOString().split('T')[0]
    }])
    setInviteEmail('')
  }

  const handleRemoveMember = (id: string) => {
    setTeamMembers(prev => prev.filter(m => m.id !== id))
    toast.success('Team member removed')
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Branding */}
      <motion.div className="glass p-6 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Building2 size={20} className="text-sky-400" /> Hospital Branding
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="label text-xs mb-2">Hospital Name</label>
              <input
                type="text"
                value={hospitalName}
                onChange={e => setHospitalName(e.target.value)}
                className="w-full bg-slate-800/50 border border-white/5 rounded-xl px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="label text-xs mb-2">Primary Color</label>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => setActiveColor(color)}
                      className={`w-8 h-8 rounded-lg transition-all ${activeColor === color ? 'ring-2 ring-white' : ''}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <span className="text-sm font-mono text-slate-400">{activeColor}</span>
              </div>
            </div>
          </div>
          <div>
            <label className="label text-xs mb-2">Hospital Logo</label>
            <div className="aspect-video rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 hover:border-sky-500/50 transition-colors cursor-pointer bg-slate-800/30">
              <Building2 size={32} className="text-slate-600" />
              <span className="text-xs text-slate-500">Click to upload logo</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button className="btn-primary text-sm">Save Changes</button>
        </div>
      </motion.div>

      {/* API Section */}
      <motion.div className="glass p-6 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Shield size={20} className="text-sky-400" /> API Integration
        </h3>
        <div className="space-y-4">
          <div>
            <label className="label text-xs mb-2">API Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 rounded-xl bg-slate-800/50 font-mono text-sm text-slate-300">
                {showApiKey ? 'med_live_12345abcdef' : apiKey}
              </code>
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400"
              >
                <Eye size={18} />
              </button>
              <button
                onClick={handleCopyApiKey}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400"
              >
                <Copy size={18} />
              </button>
              <button
                onClick={handleRegenerateApiKey}
                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400"
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Never share your API key. It grants full access to hospital data.</p>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">12,450</p>
              <p className="text-xs text-slate-500">API calls this month</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">99.8%</p>
              <p className="text-xs text-slate-500">Uptime</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">245ms</p>
              <p className="text-xs text-slate-500">Avg response</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Team Members */}
      <motion.div className="glass p-6 rounded-xl">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Users size={20} className="text-sky-400" /> Team Members
        </h3>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter email to invite..."
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="flex-1 bg-slate-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm"
            />
            <select className="bg-slate-800/50 border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm">
              <option value="staff">Staff</option>
              <option value="doctor">Doctor</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleInvite}
              className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2"
            >
              <Plus size={16} /> Invite
            </button>
          </div>
          <div className="space-y-2">
            {teamMembers.map(member => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                    {member.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white text-sm">{member.email}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      member.role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                      member.role === 'doctor' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {member.role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────────
export default function HospitalAdmin() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('dashboard')

  const { data: stats } = useQuery({
    queryKey: ['hospital-dashboard'],
    queryFn: () => hospitalApi.dashboard().then(res => res.data as DashboardStats)
  })

  const { data: analytics } = useQuery({
    queryKey: ['hospital-analytics'],
    queryFn: () => hospitalApi.analytics().then(res => res.data as AnalyticsData),
    enabled: activeTab === 'analytics' || activeTab === 'dashboard'
  })

  // Mock patients data
  const mockPatients: Patient[] = [
    { id: '1', name: 'Ahmed Khan', mrn: 'MRN001234', report_date: 'Apr 8, 2024', language: 'ur', status: 'completed', abnormal_count: 2, report_id: 'rpt_1' },
    { id: '2', name: 'Fatima Ali', mrn: 'MRN001235', report_date: 'Apr 8, 2024', language: 'en', status: 'reviewed', abnormal_count: 0, report_id: 'rpt_2' },
    { id: '3', name: 'Muhammad Raza', mrn: 'MRN001236', report_date: 'Apr 7, 2024', language: 'ur', status: 'pending', abnormal_count: 3, report_id: 'rpt_3' },
    { id: '4', name: 'Sanaullah', mrn: 'MRN001237', report_date: 'Apr 7, 2024', language: 'hi', status: 'completed', abnormal_count: 1, report_id: 'rpt_4' },
    { id: '5', name: 'Zainab Bibi', mrn: 'MRN001238', report_date: 'Apr 6, 2024', language: 'ur', status: 'completed', abnormal_count: 0, report_id: 'rpt_5' },
  ]

  if (user?.role !== 'hospital_admin') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="glass p-10 text-center max-w-md">
          <Shield size={48} className="mx-auto text-red-500 mb-6" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-8">This portal is for hospital administrators only.</p>
          <button onClick={() => window.history.back()} className="btn-secondary w-full">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hospitalName={stats?.hospital_name || 'City Hospital'}
        hospitalLogo={stats?.hospital_logo}
      />

      <main className="ml-64 p-8">
        <AnimatePresence mode="wait">
          {/* ── DASHBOARD TAB ── */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div>
                <h1 className="text-2xl font-black text-white mb-1">Dashboard</h1>
                <p className="text-slate-500">Overview of your hospital's activity</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Patients Today" value={stats?.patients_today || 24} change={12} icon={Users} color="#0ea5e9" isAnimated />
                <StatCard title="Reports Processed" value={stats?.reports_processed || 156} change={24} icon={FileText} color="#48bf8e" isAnimated />
                <StatCard title="Abnormal Rate" value={`${stats?.abnormal_rate_percent || 18}%`} change={-5} icon={AlertCircle} color="#ef4444" />
                <StatCard title="API Calls This Month" value={stats?.api_calls_this_month || 12450} change={8} icon={BarChart3} color="#8b5cf6" isAnimated />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass p-6 rounded-xl">
                  <h3 className="text-white font-bold mb-6">Reports Per Day (Last 30 Days)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics?.daily_reports.slice(-30) || [
                        { date: 'Mar 10', count: 12, abnormal_count: 2 },
                        { date: 'Mar 15', count: 18, abnormal_count: 3 },
                        { date: 'Mar 20', count: 25, abnormal_count: 4 },
                        { date: 'Mar 25', count: 32, abnormal_count: 5 },
                        { date: 'Mar 30', count: 28, abnormal_count: 3 },
                        { date: 'Apr 5', count: 45, abnormal_count: 8 },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: '#94a3b8' }}
                        />
                        <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9' }} />
                        <Line type="monotone" dataKey="abnormal_count" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass p-6 rounded-xl">
                  <h3 className="text-white font-bold mb-4">Language Distribution</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Urdu', value: 60, color: '#0ea5e9' },
                            { name: 'English', value: 25, color: '#8b5cf6' },
                            { name: 'Hindi', value: 10, color: '#10b981' },
                            { name: 'Other', value: 5, color: '#64748b' },
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          dataKey="value"
                        >
                          {[0, 1, 2, 3].map((_entry, index) => (
                            <Cell key={'cell-' + index} fill={['#0ea5e9', '#8b5cf6', '#10b981', '#64748b'][index]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-4">
                    {[
                      { label: 'Urdu', value: 60, color: '#0ea5e9' },
                      { label: 'English', value: 25, color: '#8b5cf6' },
                      { label: 'Hindi', value: 10, color: '#10b981' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                          <span className="text-slate-400">{item.label}</span>
                        </div>
                        <span className="text-white font-medium">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="glass p-6 rounded-xl">
                <h3 className="text-white font-bold mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {[
                    { action: 'Report processed', detail: 'Blood test for Patient #1234', time: '2 min ago', icon: FileText },
                    { action: 'Patient registered', detail: 'New patient: Fatima Ali', time: '15 min ago', icon: Users },
                    { action: 'Abnormal alert', detail: 'High glucose detected in report #5678', time: '32 min ago', icon: AlertCircle },
                    { action: 'Bulk upload completed', detail: '23 reports processed successfully', time: '1 hour ago', icon: Upload },
                  ].map((activity, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/5">
                      <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                        <activity.icon size={18} className="text-sky-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{activity.action}</p>
                        <p className="text-slate-500 text-xs">{activity.detail}</p>
                      </div>
                      <span className="text-slate-600 text-xs">{activity.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── PATIENTS TAB ── */}
          {activeTab === 'patients' && (
            <motion.div
              key="patients"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-6">
                <h1 className="text-2xl font-black text-white mb-1">Patients</h1>
                <p className="text-slate-500">Manage patient reports and records</p>
              </div>
              <PatientTable patients={mockPatients} />
            </motion.div>
          )}

          {/* ── BULK UPLOAD TAB ── */}
          {activeTab === 'bulk' && (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl"
            >
              <div className="mb-6">
                <h1 className="text-2xl font-black text-white mb-1">Bulk Upload</h1>
                <p className="text-slate-500">Upload multiple reports at once</p>
              </div>
              <BulkUploadSection />
            </motion.div>
          )}

          {/* ── ANALYTICS TAB ── */}
          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-black text-white mb-1">Analytics</h1>
                <p className="text-slate-500">Detailed insights and trends</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass p-6 rounded-xl text-center">
                  <div className="relative w-32 h-32 mx-auto mb-4">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                      <motion.circle
                        cx="64" cy="64" r="56"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={352}
                        strokeDashoffset={352 - (352 * 18) / 100}
                        initial={{ strokeDashoffset: 352 }}
                        animate={{ strokeDashoffset: 352 - (352 * 18) / 100 }}
                        transition={{ duration: 1.5 }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-black text-white">18%</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">Abnormal Rate</p>
                </div>

                <div className="md:col-span-2 glass p-6 rounded-xl">
                  <h3 className="text-white font-bold mb-4">Top Tests</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.top_tests.slice(0, 5) || [
                        { name: 'Blood Glucose', count: 145 },
                        { name: 'CBC', count: 132 },
                        { name: 'Lipid Profile', count: 98 },
                        { name: 'Thyroid', count: 76 },
                        { name: 'Liver Function', count: 54 },
                      ]} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                        <XAxis type="number" stroke="#64748b" fontSize={10} />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={100} />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                        />
                        <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── SETTINGS TAB ── */}
          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-6">
                <h1 className="text-2xl font-black text-white mb-1">Settings</h1>
                <p className="text-slate-500">Manage your hospital preferences</p>
              </div>
              <SettingsSection stats={stats} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
