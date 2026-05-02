import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { reportsApi, type ReportSummary } from '@/lib/api'

interface ReportState {
  recentReports: ReportSummary[]
  activeAnalysisId: string | null
  error: string | null
  isLoading: boolean

  // Actions
  setRecentReports: (reports: ReportSummary[]) => void
  fetchRecentReports: (page?: number, limit?: number) => Promise<void>
  setActiveAnalysis: (id: string | null) => void
  addRecentReport: (report: ReportSummary) => void
  reset: () => void
}

export const useReportStore = create<ReportState>()(
  persist(
    (set, get) => ({
      recentReports: [],
      activeAnalysisId: null,
      error: null,
      isLoading: false,

      setRecentReports: (reports) => set({ recentReports: reports }),

      fetchRecentReports: async (page = 1, limit = 5) => {
        set({ isLoading: true, error: null })
        try {
          const res = await reportsApi.list(page, limit)
          set({ recentReports: res.data.reports, isLoading: false })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Failed to fetch reports'
          set({ error: message, isLoading: false })
        }
      },

      setActiveAnalysis: (id) => set({ activeAnalysisId: id }),

      addRecentReport: (report) => {
        const current = get().recentReports
        // Don't add if already exists
        if (current.find((r) => r.id === report.id)) return
        set({ recentReports: [report, ...current].slice(0, 10) })
      },

      reset: () => set({ recentReports: [], activeAnalysisId: null, error: null, isLoading: false }),
    }),
    {
      name: 'medireport-reports',
      partialize: (state) => ({ recentReports: state.recentReports }),
    }
  )
)
