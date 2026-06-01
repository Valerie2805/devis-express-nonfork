import { create } from 'zustand'

type AuthState = {
  token: string | null
  setToken: (token: string | null) => void
}

const STORAGE_KEY = 'mad_token_v1'

export const useAuthStore = create<AuthState>((set) => ({
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

