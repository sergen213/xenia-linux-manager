import { describe, it, expect } from 'vitest'
import { zoomForWidth } from '../zoom'

describe('zoomForWidth', () => {
  it('keeps 1080p at 1.0', () => expect(zoomForWidth(1920)).toBe(1))
  it('clamps narrower-than-baseline to 1.0', () => expect(zoomForWidth(1366)).toBe(1))
  it('scales an unscaled 4K panel to 2.0', () => expect(zoomForWidth(3840)).toBe(2))
  it('clamps ultra-wide / 8K to MAX 2.0', () => expect(zoomForWidth(7680)).toBe(2))
  it('scales 1440p between the bounds', () => expect(zoomForWidth(2560)).toBeCloseTo(1.333, 2))
})
