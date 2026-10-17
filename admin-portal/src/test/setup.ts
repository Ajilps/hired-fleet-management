import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { onlineManager } from '@tanstack/react-query'
import { useAuthStore } from '../features/auth'
import { clearTestQueryClients } from './query-clients'

afterEach(() => {
  cleanup()
  clearTestQueryClients()
  onlineManager.setOnline(true)
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})
