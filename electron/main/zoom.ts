import { BrowserWindow, screen } from 'electron'

// On Linux/X11 Chromium often reports a HiDPI panel's scaleFactor as 1, so the
// renderer maps 1 CSS px → 1 physical px and the whole UI is half-size on a 4K
// display. Scale the window's zoom to the display instead. workAreaSize is in
// DIPs, so any OS scaling is already folded in: an OS-scaled 4K reports ~1920
// (→ 1.0), an unscaled 4K reports 3840 (→ 2.0). 1080p stays 1.0, so existing
// setups are unchanged.
const BASELINE_WIDTH = 1920
const MAX_ZOOM = 2

export function zoomForWidth(widthDip: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, widthDip / BASELINE_WIDTH))
}

function displayZoom(win: BrowserWindow): number {
  return zoomForWidth(screen.getDisplayMatching(win.getBounds()).workAreaSize.width)
}

// Chromium resets zoom on every navigation, so re-apply on load; also re-apply
// when the window is dragged to a different monitor. Returns an unsubscribe for
// the 'moved' listener (the webContents listener dies with the webContents).
export function wireDisplayZoom(win: BrowserWindow): () => void {
  const apply = (): void => {
    if (!win.isDestroyed()) win.webContents.setZoomFactor(displayZoom(win))
  }
  win.webContents.on('did-finish-load', apply)
  win.on('moved', apply)
  return () => win.off('moved', apply)
}
