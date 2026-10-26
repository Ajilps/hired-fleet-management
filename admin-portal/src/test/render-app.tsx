import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import App from '../app/App'
import { AuthSessionMonitor } from '../features/auth'
import { createTestQueryClient } from './query-clients'

export function renderApp(path = '/login') {
  const queryClient = createTestQueryClient()
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthSessionMonitor />
      <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, queryClient }
}
