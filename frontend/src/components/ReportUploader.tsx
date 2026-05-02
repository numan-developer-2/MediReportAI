import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, X, AlertCircle, FileText, CheckCircle2 } from 'lucide-react'

interface Props {
  onFileSelect: (file: File | null) => void
  isUploading: boolean
  uploadProgress: number
}

type DropState = 'idle' | 'drag_over' | 'selected' | 'error'

const MAX_SIZE = 5 * 1024 * 1024  // 5 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// Shake animation for error state
const shakeVariants = {
  idle: { x: 0 },
  shake: { x: [-8, 8, -6, 6, -4, 4, 0], transition: { duration: 0.4 } },
}

export default function ReportUploader({ onFileSelect, isUploading, uploadProgress }: Props) {
  const [dropState, setDropState] = useState<DropState>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [shaking, setShaking] = useState(false)

  const triggerShake = () => {
    setShaking(true)
    setTimeout(() => setShaking(false), 450)
  }

  const handleFile = useCallback((accepted: File[], rejected: FileRejection[]) => {
    // Handle rejections
    if (rejected.length > 0) {
      const errMsg = rejected[0].errors[0]?.message ?? ''
      const msg = errMsg.includes('file-too-large')
        ? 'File is too large. Maximum size is 5 MB.'
        : errMsg.includes('file-invalid-type')
        ? 'Invalid file type. Upload JPG, PNG, WEBP, or PDF.'
        : 'File rejected. Please try another file.'
      setErrorMsg(msg)
      setDropState('error')
      triggerShake()
      return
    }

    if (accepted.length === 0) return

    const f = accepted[0]
    setFile(f)
    setDropState('selected')
    setErrorMsg('')
    onFileSelect(f)

    // Generate image preview
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }, [onFileSelect])

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    setFile(null)
    setPreview(null)
    setDropState('idle')
    onFileSelect(null)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFile,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'application/pdf': ['.pdf'] },
    maxSize: MAX_SIZE,
    multiple: false,
    disabled: isUploading,
    onDragEnter: () => setDropState(file ? 'selected' : 'drag_over'),
    onDragLeave: () => setDropState(file ? 'selected' : 'idle'),
  })

  const isError  = dropState === 'error'
  const isOver   = isDragActive
  const hasFIle  = dropState === 'selected' && file

  const borderColor = isError  ? '#ef4444'
    : isOver   ? '#0ea5e9'
    : hasFIle  ? '#22c55e'
    : 'rgba(255,255,255,0.1)'

  const bgColor = isError  ? 'rgba(239,68,68,0.04)'
    : isOver   ? 'rgba(14,165,233,0.06)'
    : hasFIle  ? 'rgba(34,197,94,0.04)'
    : 'rgba(255,255,255,0.02)'

  return (
    <div>
      <motion.div
        variants={shakeVariants}
        animate={shaking ? 'shake' : 'idle'}>
        <div
          {...getRootProps()}
          id="drop-zone"
          className="relative rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden"
          style={{
            border: `2px dashed ${borderColor}`,
            background: bgColor,
            minHeight: hasFIle ? '180px' : '220px',
            transform: isOver ? 'scale(1.02)' : 'scale(1)',
          }}>

          <input {...getInputProps()} id="file-input" />

          {/* Breathing glow on idle */}
          {!hasFIle && !isOver && !isError && (
            <motion.div className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{ opacity: [0, 0.08, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ background: 'radial-gradient(circle at center, #0ea5e9, transparent 70%)' }} />
          )}

          {/* Drag-over overlay */}
          <AnimatePresence>
            {isOver && (
              <motion.div className="absolute inset-0 rounded-2xl pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ background: 'radial-gradient(ellipse at center, rgba(14,165,233,0.12), transparent 70%)' }} />
            )}
          </AnimatePresence>

          <div className="flex flex-col items-center justify-center p-8 text-center min-h-[inherit]">

            <AnimatePresence mode="wait">

              {/* STATE: UPLOADING */}
              {isUploading && (
                <motion.div key="uploading" className="w-full"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <div className="text-4xl mb-4">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      style={{ display: 'inline-block' }}>
                      ⚙️
                    </motion.span>
                  </div>
                  <p className="text-white font-semibold mb-4">Uploading & Analyzing...</p>
                  <div className="w-full max-w-xs mx-auto">
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>Progress</span>
                      <span>{Math.round(Math.min(uploadProgress, 100))}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #0ea5e9, #6366f1)' }}
                        animate={{ width: `${Math.min(uploadProgress, 100)}%` }}
                        transition={{ ease: 'easeOut' }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">AI pipeline: OCR → Analysis → Translation</p>
                  </div>
                </motion.div>
              )}

              {/* STATE: FILE SELECTED */}
              {!isUploading && hasFIle && (
                <motion.div key="selected" className="w-full flex items-start gap-4"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>

                  {/* Preview / icon */}
                  {preview ? (
                    <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                      <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-20 h-20 rounded-xl flex items-center justify-center"
                      style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}>
                      <FileText size={28} className="text-sky-400" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatBytes(file.size)}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <CheckCircle2 size={13} className="text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-medium">Ready to analyze</span>
                        </div>
                      </div>
                      <motion.button onClick={removeFile}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        title="Remove file">
                        <X size={14} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STATE: DRAG OVER */}
              {!isUploading && !hasFIle && isOver && (
                <motion.div key="drag-over"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <motion.div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)' }}
                    animate={{ y: [-4, 4, -4] }} transition={{ duration: 0.8, repeat: Infinity }}>
                    <UploadCloud size={28} className="text-sky-400" />
                  </motion.div>
                  <p className="text-sky-400 font-bold text-lg">Release to upload</p>
                  <p className="text-slate-500 text-sm mt-1">Your file is ready to drop</p>
                </motion.div>
              )}

              {/* STATE: ERROR */}
              {!isUploading && !hasFIle && isError && !isOver && (
                <motion.div key="error"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <AlertCircle size={28} className="text-red-400" />
                  </div>
                  <p className="text-red-400 font-semibold mb-1">{errorMsg}</p>
                  <p className="text-slate-500 text-sm">Click to try again</p>
                </motion.div>
              )}

              {/* STATE: IDLE */}
              {!isUploading && !hasFIle && !isOver && !isError && (
                <motion.div key="idle"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Pulsing icon */}
                  <div className="relative w-20 h-20 mx-auto mb-5">
                    <motion.div className="absolute inset-0 rounded-2xl"
                      animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                      style={{ background: 'rgba(14,165,233,0.15)' }} />
                    <div className="relative w-full h-full rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}>
                      <UploadCloud size={30} className="text-sky-400" />
                    </div>
                  </div>
                  <p className="text-white font-bold text-lg mb-1">
                    Drop your lab report here
                  </p>
                  <p className="text-slate-500 text-sm mb-4">or click to browse files</p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {['JPG', 'PNG', 'WEBP', 'PDF'].map(ext => (
                      <span key={ext} className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>
                        {ext}
                      </span>
                    ))}
                    <span className="text-xs text-slate-600">• Max 5 MB</span>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Error message below zone */}
      <AnimatePresence>
        {isError && errorMsg && (
          <motion.div className="flex items-center gap-2 mt-2 text-sm text-red-400"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <AlertCircle size={13} />
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
