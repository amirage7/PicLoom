const PACKAGED_BACKEND_ORIGIN = 'http://127.0.0.1:8001'

export function localBackendUrl(path: string, protocol = window.location.protocol): string {
  if (!path.startsWith('/')) throw new Error('Local backend path must be absolute')
  return protocol === 'file:' ? `${PACKAGED_BACKEND_ORIGIN}${path}` : path
}
