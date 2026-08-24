import { useEffect, useState } from 'react'

import { getBackendHealth } from './api'


export type BackendStatus = 'checking' | 'online' | 'offline'

export function useBackendHealth(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()

    getBackendHealth(controller.signal)
      .then(() => setStatus('online'))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('offline')
      })

    return () => controller.abort()
  }, [])

  return status
}
