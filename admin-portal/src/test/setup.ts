import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { beforeEach, afterEach, vi } from 'vitest'
import { onlineManager } from '@tanstack/react-query'
import { useAuthStore } from '../features/auth'
import { clearTestQueryClients } from './query-clients'

// Node's BroadcastChannel spans Vitest workers, unlike origin-scoped browser tabs.
// Cross-tab behavior is verified by the real desktop/mobile browser suite.
beforeEach(() => { vi.stubGlobal('BroadcastChannel', undefined) })

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
