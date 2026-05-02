import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Play, Pause, Volume2 } from 'lucide-react'

interface Props {
  explanation_ur: string | null
  explanation_en: string | null
  language: 'ur' | 'en'
  isLoading: boolean
  audio_url_ur?: string | null
  audio_url_en?: string | null
}

function SkeletonLines() {
  return (
    <div className="space-y-3 p-6">
      {[100, 90, 95, 80, 85].map((w, i) => (
        <div key={i} className={`skeleton h-4 rounded`} style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

export default function ResultCard({ explanation_ur, explanation_en, language, isLoading, audio_url_ur, audio_url_en }: Props) {
  const isUrdu = language === 'ur'
  const text   = isUrdu ? explanation_ur : explanation_en
  const hasText = text && text.trim().length > 0
  const audioUrl = isUrdu ? audio_url_ur : audio_url_en
  const hasAudio = audioUrl && audioUrl.trim().length > 0
  
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const toggleAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl!)
      audioRef.current.onended = () => setIsPlaying(false)
    }
    
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  return (
    <div className="glass overflow-hidden"
      style={{ borderTop: '2px solid', borderImage: 'linear-gradient(90deg, #0ea5e9, #6366f1) 1' }}>

      {/* Card header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(14,165,233,0.2)' }}>
            <Sparkles size={15} className="text-sky-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">AI Explanation</p>
            <p className="text-xs text-slate-500">{isUrdu ? 'اردو میں وضاحت' : 'English Summary'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Audio Play Button */}
          {hasAudio && (
            <button
              onClick={toggleAudio}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ 
                background: isPlaying ? 'rgba(34,197,94,0.2)' : 'rgba(14,165,233,0.1)', 
                color: isPlaying ? '#22c55e' : '#38bdf8',
                border: `1px solid ${isPlaying ? 'rgba(34,197,94,0.3)' : 'rgba(14,165,233,0.2)'}'
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? 'Playing...' : 'Listen'}
            </button>
          )}
          <div className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
            AI Generated
          </div>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SkeletonLines />
          </motion.div>
        ) : !hasText ? (
          <motion.div key="empty" className="p-8 text-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-slate-500 text-sm">
              {isUrdu ? 'اردو وضاحت دستیاب نہیں' : 'Explanation not available yet. Still processing...'}
            </p>
          </motion.div>
        ) : (
          <motion.div key={`text-${language}`}
            className="p-6"
            initial={{ opacity: 0, x: isUrdu ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: isUrdu ? -20 : 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}>

            {isUrdu ? (
              /* RTL Urdu Text */
              <div dir="rtl" className="urdu-text leading-loose" style={{ fontSize: '1.175rem' }}>
                <AnimatedText text={text!} />
              </div>
            ) : (
              /* LTR English Text */
              <div className="text-slate-200 leading-loose text-[0.9375rem]">
                <AnimatedText text={text!} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AnimatedText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone]           = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    if (!text) return

    // Fast reveal: show full text after a brief animation
    const words = text.split(' ')
    let i = 0
    const tick = () => {
      if (i >= words.length) { setDone(true); return }
      const chunk = Math.min(3, words.length - i)
      setDisplayed(words.slice(0, i + chunk).join(' '))
      i += chunk
      setTimeout(tick, 20)
    }
    const timeout = setTimeout(tick, 100)
    return () => clearTimeout(timeout)
  }, [text])

  return (
    <>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-4 bg-sky-400 ml-0.5 animate-pulse align-middle" />}
    </>
  )
}
