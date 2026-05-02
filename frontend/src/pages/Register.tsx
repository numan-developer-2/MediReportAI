import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Mail, Lock, User, Globe, Heart, Activity, Stethoscope } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'

const schema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Min 8 characters').regex(/\d/, 'Must contain a number'),
  language: z.enum(['ur', 'en', 'hi', 'ar', 'bn']),
  terms: z.boolean().refine(v => v, 'You must accept the terms'),
})
type FormData = z.infer<typeof schema>

const LANGUAGES = [
  { code: 'ur', label: 'Urdu', flag: 'PK', native: 'اردو' },
  { code: 'en', label: 'English', flag: 'US', native: 'English' },
  { code: 'hi', label: 'Hindi', flag: 'IN', native: 'हिन्दी' },
  { code: 'ar', label: 'Arabic', flag: 'SA', native: 'العربية' },
  { code: 'bn', label: 'Bangla', flag: 'BD', native: 'বাংলা' },
]

function getStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0
  if (pwd.length >= 8)  score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd))    score++
  if (/[!@#$%^&*]/.test(pwd)) score++
  const levels = [
    { label: '', color: '#1e293b' },
    { label: 'Weak', color: '#ef4444' },
    { label: 'Fair', color: '#f97316' },
    { label: 'Good', color: '#eab308' },
    { label: 'Strong', color: '#22c55e' },
    { label: 'Very Strong', color: '#10b981' },
  ]
  return { score, ...levels[Math.min(score, 5)] }
}

const floatingIcons = [
  { Icon: Heart,       x: '8%',  y: '25%', delay: 0   },
  { Icon: Activity,    x: '80%', y: '18%', delay: 0.4 },
  { Icon: Stethoscope, x: '15%', y: '68%', delay: 0.8 },
  { Icon: Heart,       x: '78%', y: '72%', delay: 1.2 },
]

export default function Register() {
  const navigate = useNavigate()
  const { register: registerUser, isLoading } = useAuthStore()
  const [showPass, setShowPass] = useState(false)
  const [pwdValue, setPwdValue] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: '', email: '', password: '', language: 'ur', terms: false },
  })

  const strength = getStrength(pwdValue)

  const onSubmit = async (data: FormData) => {
    try {
      await registerUser(data.email, data.password, data.full_name, data.language)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      if (typeof msg === 'string') toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-5/12 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #6366f1 70%, #0ea5e9 100%)' }}>

        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")" }} />

        {floatingIcons.map(({ Icon, x, y, delay }, i) => (
          <motion.div key={i} className="absolute text-white/15"
            style={{ left: x, top: y }}
            animate={{ y: [0, -15, 0], rotate: [0, 8, -8, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, delay }}>
            <Icon size={30 + i * 4} />
          </motion.div>
        ))}

        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />

        <motion.div className="relative z-10 text-center px-10"
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}>
          <div className="text-5xl mb-6">🩺</div>
          <h1 className="text-3xl font-black text-white mb-4">
            Join <span className="text-indigo-200">MediReport AI</span>
          </h1>
          <p className="text-white/70 text-base leading-relaxed mb-8">
            Free account includes 3 reports/month.<br />
            No credit card required.
          </p>
          <div className="space-y-3">
            {['AI-powered lab report analysis', 'Urdu + 5 other languages', 'Abnormal values highlighted', 'PDF export & report history'].map(f => (
              <div key={f} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-5 h-5 rounded-full bg-indigo-400/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-indigo-300 text-xs">✓</span>
                </div>
                {f}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-full lg:w-7/12 flex items-center justify-center p-6 lg:p-12 overflow-y-auto"
        style={{ background: '#0f172a' }}>
        <motion.div className="w-full max-w-lg"
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}>

          <div className="lg:hidden mb-6 text-center">
            <span className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-4 py-2 rounded-full text-sm font-bold">
              🩺 MediReport AI
            </span>
          </div>

          <div className="mb-7">
            <h2 className="text-3xl font-black text-white mb-2">Create your account</h2>
            <p className="text-slate-400">Free plan — no credit card needed</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="label">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input {...register('full_name')} id="reg-name" placeholder="Ahmed Khan"
                  className={`input pl-10 ${errors.full_name ? 'input-error' : ''}`} />
              </div>
              {errors.full_name && <p className="error-msg">{errors.full_name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input {...register('email')} type="email" id="reg-email" placeholder="you@example.com"
                  className={`input pl-10 ${errors.email ? 'input-error' : ''}`} />
              </div>
              {errors.email && <p className="error-msg">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
                <input {...register('password')}
                  type={showPass ? 'text' : 'password'} id="reg-password"
                  placeholder="Min 8 chars, 1 number"
                  className={`input pl-10 pr-11 ${errors.password ? 'input-error' : ''}`}
                  onChange={e => { setPwdValue(e.target.value); register('password').onChange(e) }} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {/* Strength bar */}
              <AnimatePresence>
                {pwdValue && (
                  <motion.div className="mt-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{ background: i <= strength.score ? strength.color : '#1e293b' }} />
                      ))}
                    </div>
                    {strength.label && (
                      <p className="text-xs" style={{ color: strength.color }}>{strength.label} password</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {errors.password && <p className="error-msg">{errors.password.message}</p>}
            </div>

            {/* Language */}
            <div>
              <label className="label flex items-center gap-1.5"><Globe size={14} /> Preferred Language</label>
              <div className="grid grid-cols-5 gap-2">
                {LANGUAGES.map(lang => {
                  const selected = watch('language') === lang.code
                  return (
                    <label key={lang.code} className={`cursor-pointer rounded-xl p-2 text-center border transition-all duration-200 ${selected ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                      <input type="radio" value={lang.code} {...register('language')} className="sr-only" />
                      <div className="text-lg mb-0.5">{lang.flag === 'PK' ? 'PK' : lang.flag === 'US' ? 'EN' : lang.flag === 'IN' ? 'HI' : lang.flag === 'SA' ? 'AR' : 'BN'}</div>
                      <div className={`text-xs font-medium ${selected ? 'text-sky-400' : 'text-slate-400'}`}>{lang.label}</div>
                      <div className={`text-xs ${selected ? 'text-sky-300' : 'text-slate-500'}`}>{lang.native}</div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Terms */}
            <div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" {...register('terms')} id="terms"
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 accent-sky-500 flex-shrink-0" />
                <span className="text-sm text-slate-400">
                  I agree to the{' '}
                  <a href="/terms" className="text-sky-400 hover:underline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" className="text-sky-400 hover:underline">Privacy Policy</a>
                </span>
              </label>
              {errors.terms && <p className="error-msg">{errors.terms.message}</p>}
            </div>

            {/* Submit */}
            <motion.button type="submit" id="reg-submit" disabled={isLoading}
              className="btn-primary w-full text-base py-3.5"
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : 'Create Free Account'}
            </motion.button>

            <p className="text-center text-slate-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-sky-400 font-semibold hover:text-sky-300 transition-colors">
                Sign in →
              </Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  )
}
