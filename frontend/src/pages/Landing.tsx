import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  ArrowRight, CheckCircle2, Shield, Zap, 
  Globe, Smartphone, FileText, Activity 
} from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
}

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
}

export default function Landing() {
  const { isAuthenticated } = useAuthStore()

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden">
      {/* ── GRAIN OVERLAY ──────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      {/* ── HERO SECTION ───────────────────────────── */}
      <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-48">
        {/* Ambient Glows */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />

        <div className="page-container relative z-10 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-bold mb-8"
          >
            <Zap size={12} className="fill-brand-400" />
            <span>AI-Powered Medical Insights</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl lg:text-7xl font-black tracking-tight mb-6 leading-[1.1]"
          >
            Understand Your <br />
            <span className="gradient-text">Lab Reports</span> Instantly
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-slate-400 text-lg lg:text-xl max-w-2xl mx-auto mb-10 text-balance"
          >
            Upload a photo of your medical report. Our AI explains it in simple 
            Urdu and 40+ other languages, highlighting what matters most for your health.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to={isAuthenticated ? "/upload" : "/register"} className="btn-primary w-full sm:w-auto px-8 py-4 text-base group">
              Get Started for Free
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/login" className="btn-secondary w-full sm:w-auto px-8 py-4 text-base">
              Sign In
            </Link>
          </motion.div>

          {/* Trust Markers */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-16 pt-16 border-t border-white/5 flex flex-wrap justify-center items-center gap-8 lg:gap-16 grayscale opacity-40"
          >
            <div className="flex items-center gap-2 font-bold text-xl"><Shield size={24}/> Secure Data</div>
            <div className="flex items-center gap-2 font-bold text-xl"><CheckCircle2 size={24}/> HIPAA Ready</div>
            <div className="flex items-center gap-2 font-bold text-xl uppercase tracking-widest">Global Access</div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────── */}
      <section className="py-24 bg-slate-900/50 relative">
        <div className="page-container relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-black mb-4">Powerful Medical Intelligence</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              We translate complex medical jargon into clear, actionable insights for you and your family.
            </p>
          </div>

          <motion.div 
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[
              {
                icon: Smartphone,
                title: "Snap a Photo",
                desc: "Just take a clear photo of your report. Our OCR handles the rest with high precision.",
                color: "emerald"
              },
              {
                icon: Zap,
                title: "AI Analysis",
                desc: "Flan-T5 models identify abnormal values and explain what they mean in plain text.",
                color: "blue"
              },
              {
                icon: Globe,
                title: "In Your Language",
                desc: "Full explanation in simple Urdu, Hindi, Arabic, and more. No more Google Translate.",
                color: "purple"
              },
              {
                icon: Shield,
                title: "Privacy First",
                desc: "End-to-end encryption. Your medical data is yours alone and is never sold.",
                color: "rose"
              }
            ].map((feat, i) => (
              <motion.div 
                key={i}
                variants={fadeIn}
                className="glass-hover p-8 group border border-white/5"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 bg-brand-500/10 text-brand-400 group-hover:scale-110 transition-transform`}>
                  <feat.icon size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">{feat.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feat.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────── */}
      <section className="py-24">
        <div className="page-container">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              <h2 className="text-4xl lg:text-5xl font-black leading-tight">
                From Confusion to <br />
                <span className="text-brand-400">Total Clarity</span>
              </h2>
              
              <div className="space-y-6">
                {[
                  { step: "01", title: "Upload your report", desc: "PDF or Image. Our system reads everything from blood tests to MRI summaries." },
                  { step: "02", title: "Wait for AI magic", desc: "In under 60 seconds, our clinical-grade AI processes every value." },
                  { step: "03", title: "Get Explained", desc: "Read the summary in Urdu or English. High values are flagged in red." },
                ].map((s, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="text-2xl font-black text-brand-500/30">{s.step}</div>
                    <div>
                      <h4 className="text-lg font-bold mb-1">{s.title}</h4>
                      <p className="text-slate-400 text-sm">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link to="/register" className="btn-primary px-8">Try it now</Link>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="absolute inset-0 bg-brand-500/20 blur-[100px] rounded-full pointer-events-none" />
              <div className="glass p-2 relative overflow-hidden aspect-square flex items-center justify-center">
                 <div className="w-full h-full bg-slate-800 rounded-xl flex flex-col items-center justify-center gap-4 text-slate-500">
                    <FileText size={64}/>
                    <span className="text-sm font-medium">Lab Report Preview</span>
                 </div>
                 {/* Floating Badges */}
                 <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-10 right-10 bg-red-500/20 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-full text-xs font-bold"
                 >
                   Critical High Detected
                 </motion.div>
                 <motion.div 
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute bottom-12 left-8 bg-brand-500/20 text-brand-400 border border-brand-500/30 px-3 py-1.5 rounded-full text-xs font-bold"
                 >
                   Normal Range
                 </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── B2B BANNER ─────────────────────────────── */}
      <section className="py-24 bg-brand-600 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 blur-[100px] rounded-full" />
        <div className="page-container relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold">
              <Activity size={12} />
              <span>For Hospitals & Clinics</span>
            </div>
            <h2 className="text-4xl lg:text-6xl font-black text-white">White-label AI for your facility</h2>
            <p className="text-brand-100 text-lg lg:text-xl">
              Integrate MediReport AI into your patient portal. Reduce doctor burnout 
              and improve patient satisfaction with automated report explanations.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/register?role=hospital" className="bg-white text-brand-600 px-8 py-4 rounded-xl font-bold hover:bg-brand-50 transition-colors">
                Contact Sales
              </Link>
              <Link to="/docs/hospital" className="border border-white/30 text-white px-8 py-4 rounded-xl font-bold hover:bg-white/10 transition-colors">
                View API Docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING PREVIEW ────────────────────────── */}
      <section className="py-24 relative">
        <div className="page-container">
           <div className="text-center mb-16">
              <h2 className="text-4xl font-black mb-4">Simple, Transparent Pricing</h2>
              <p className="text-slate-400">Save more with our annual plans.</p>
           </div>

           <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                { name: "Free", price: "0", limit: "3 reports/mo", features: ["OCR Analysis", "Urdu + English", "Basic Support"], cta: "Get Started" },
                { name: "Pro", price: "1,500", limit: "30 reports/mo", features: ["Faster OCR", "All Languages", "Priority Support", "PDF Exports"], popular: true, cta: "Upgrade to Pro" },
                { name: "Enterprise", price: "15,000", limit: "Unlimited", features: ["White-label API", "Custom Training", "24/7 Dedicated Support", "Bulk Processing"], cta: "Contact Us" }
              ].map((p, i) => (
                <div key={i} className={`glass p-8 relative flex flex-col ${p.popular ? 'border-brand-500/50 scale-105 z-10 shadow-2xl shadow-brand-500/20' : 'border-white/5'}`}>
                  {p.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[10px] uppercase font-black px-3 py-1 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <div className="text-lg font-bold mb-2">{p.name}</div>
                  <div className="mb-6">
                    <span className="text-sm font-medium text-slate-500">PKR</span>
                    <span className="text-4xl font-black ml-1">{p.price}</span>
                    <span className="text-sm text-slate-500">/mo</span>
                  </div>
                  <div className="text-xs font-bold text-brand-400 mb-6 uppercase tracking-widest">{p.limit}</div>
                  <div className="space-y-4 mb-8 flex-1">
                    {p.features.map((f, j) => (
                      <div key={j} className="flex items-center gap-3 text-sm text-slate-300">
                        <CheckCircle2 size={16} className="text-brand-500" />
                        {f}
                      </div>
                    ))}
                  </div>
                  <Link to="/register" className={`w-full py-3 rounded-xl font-bold text-center transition-all ${p.popular ? 'bg-brand-500 text-white hover:bg-brand-400' : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'}`}>
                    {p.cta}
                  </Link>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────── */}
      <footer className="py-20 border-t border-white/5 bg-slate-950/50">
        <div className="page-container">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2">
               <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base bg-brand-500">🩺</div>
                  <span className="font-black text-white text-lg tracking-tight">MediReport AI</span>
               </div>
               <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                 Empowering patients with AI-driven medical insights. 
                 Making healthcare communication simple and accessible to everyone.
               </p>
            </div>
            <div>
              <h5 className="font-bold text-white mb-6">Product</h5>
              <ul className="space-y-4 text-sm text-slate-500">
                <li><Link to="/upload" className="hover:text-brand-400 mb-2 block">Upload Report</Link></li>
                <li><Link to="/pricing" className="hover:text-brand-400 mb-2 block">Pricing</Link></li>
                <li><Link to="/docs" className="hover:text-brand-400 mb-2 block">API Documentation</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-white mb-6">Company</h5>
              <ul className="space-y-4 text-sm text-slate-500">
                <li><Link to="/about" className="hover:text-brand-400 mb-2 block">About Us</Link></li>
                <li><Link to="/privacy" className="hover:text-brand-400 mb-2 block">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-brand-400 mb-2 block">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-white mb-6">Social</h5>
              <ul className="space-y-4 text-sm text-slate-500">
                <li><a href="#" className="hover:text-brand-400">Twitter</a></li>
                <li><a href="#" className="hover:text-brand-400">LinkedIn</a></li>
                <li><a href="#" className="hover:text-brand-400">WhatsApp Support</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:row items-center justify-between gap-6 pt-8 border-t border-white/5 text-xs text-slate-600">
             <p>© 2026 MediReport AI. All rights reserved.</p>
             <p>Designed with ❤️ for global health access.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
