const tabId = crypto.randomUUID()

export function broadcastSessionChange() {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel('hired-session')
  channel.postMessage({ type: 'session-changed', sender: tabId })
  channel.close()
}

export function subscribeSessionChanges(onChange: () => void) {
  if (typeof BroadcastChannel === 'undefined') return () => undefined
  const channel = new BroadcastChannel('hired-session')
  channel.onmessage = (event) => {
    if (event.data?.type === 'session-changed' && typeof event.data.sender === 'string' && event.data.sender !== tabId) onChange()
  }
  return () => channel.close()
}
