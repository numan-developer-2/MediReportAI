import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Mail, Lock, Heart, Activity, Shield } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'

const schema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
})
type FormData = z.infer<typeof schema>

const floatingIcons = [
  { Icon: Heart,    x: '10%', y: '20%', delay: 0,   size: 28 },
  { Icon: Activity, x: '75%', y: '15%', delay: 0.3, size: 32 },
  { Icon: Shield,   x: '20%', y: '70%', delay: 0.6, size: 24 },
  { Icon: Heart,    x: '80%', y: '65%', delay: 0.9, size: 20 },
  { Icon: Activity, x: '50%', y: '80%', delay: 1.2, size: 26 },
]

export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()
  const [showPass, setShowPass] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.email, data.password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      if (typeof msg === 'string') toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 40%, #6366f1 100%)' }}>

        {/* Noise overlay */}
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")" }} />

        {/* Floating icons */}
        {floatingIcons.map(({ Icon, x, y, delay, size }, i) => (
          <motion.div key={i} className="absolute text-white/20"
            style={{ left: x, top: y }}
            animate={{ y: [0, -12, 0], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, delay }}>
            <Icon size={size} />
          </motion.div>
        ))}

        {/* Glowing orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #38bdf8, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />

        {/* Content */}
        <motion.div className="relative z-10 text-center px-12"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}>
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-full text-white/90 text-sm font-medium mb-8 border border-white/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            AI-Powered Medical Analysis
          </div>
          <h1 className="text-4xl font-black text-white mb-4 leading-tight">
            Every patient deserves to<br />
            <span className="text-sky-200">understand their health</span>
          </h1>
          <p className="text-white/70 text-lg leading-relaxed mb-8">
            Upload your lab report. Get a clear,<br />
            simple explanation in Urdu — instantly.
          </p>
          {/* Stats */}
          <div className="flex gap-8 justify-center">
            {[['10K+', 'Reports Analyzed'], ['98%', 'Accuracy Rate'], ['6', 'Languages']].map(([val, label]) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-black text-white">{val}</div>
                <div className="text-white/60 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12"
        style={{ background: '#0f172a' }}>
        <motion.div className="w-full max-w-md"
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}>

          {/* Logo (mobile only) */}
          <div className="lg:hidden mb-8 text-center">
            <span className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 text-sky-400 px-4 py-2 rounded-full text-sm font-bold">
              🩺 MediReport AI
            </span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-black text-white mb-2">Welcome back</h2>
            <p className="text-slate-400">Sign in to continue to MediReport AI</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input {...register('email')} type="email" id="login-email" placeholder="you@example.com"
                  className={`input pl-10 ${errors.email ? 'input-error' : ''}`} />
              </div>
              {errors.email && <p className="error-msg">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input {...register('password')} type={showPass ? 'text' : 'password'}
                  id="login-password" placeholder="Your password"
                  className={`input pl-10 pr-11 ${errors.password ? 'input-error' : ''}`} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && <p className="error-msg">{errors.password.message}</p>}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('remember')} id="remember"
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-sky-500" />
                <span className="text-sm text-slate-400">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-sky-400 hover:text-sky-300 transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <motion.button type="submit" id="login-submit"
              disabled={isLoading}
              className="btn-primary w-full text-base py-3.5"
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-slate-600 text-sm">or</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Register link */}
            <p className="text-center text-slate-400 text-sm">
              Don't have an account?{' '}
              <Link to="/register" className="text-sky-400 font-semibold hover:text-sky-300 transition-colors">
                Create one free →
              </Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
