// Type declarations for Vite environment variables
declare global {
  interface ImportMetaEnv {
    VITE_SUPABASE_URL: string
    VITE_SUPABASE_ANON_KEY: string
    VITE_API_URL: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
