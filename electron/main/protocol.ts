import { protocol, net } from 'electron'
import { resolve, sep } from 'path'
import { pathToFileURL } from 'url'

/** True iff `target` is one of `roots` or strictly inside one (no sibling-prefix tricks). */
export function isPathAllowed(target: string, roots: string[]): boolean {
  const t = resolve(target)
  return roots.some((root) => {
    const r = resolve(root)
    return t === r || t.startsWith(r + sep)
  })
}

/** Register the privileged scheme. Call BEFORE app.whenReady(). */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'xlm-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ])
}

/** Install the handler. `getRoots` returns the currently-allowed roots. Call AFTER ready. */
export function handleAssetProtocol(getRoots: () => string[]): void {
  protocol.handle('xlm-asset', async (request) => {
    const url = new URL(request.url) // xlm-asset://local/<encoded>
    const target = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!isPathAllowed(target, getRoots())) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
}
