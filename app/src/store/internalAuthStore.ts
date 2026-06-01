import { create } from 'zustand'

type InternalAuthState = {
  token: string | null
  setToken: (token: string | null) => void
}

const STORAGE_KEY = 'mad_internal_token_v1'

export const useInternalAuthStore = create<InternalAuthState>((set) => ({
  token: (() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  })(),
  setToken: (token) => {
    try {
      if (token) window.localStorage.setItem(STORAGE_KEY, token)
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {}
    set({ token })
  },
}))

