import { describe, it, expect } from 'vitest'
import { isPathAllowed } from '../protocol'

describe('isPathAllowed', () => {
  it('allows a path inside a root', () => {
    expect(isPathAllowed('/home/u/app/art/x.jpg', ['/home/u/app'])).toBe(true)
  })
  it('allows the root itself', () => {
    expect(isPathAllowed('/home/u/app', ['/home/u/app'])).toBe(true)
  })
  it('rejects a path outside all roots', () => {
    expect(isPathAllowed('/etc/shadow', ['/home/u/app'])).toBe(false)
  })
  it('rejects a traversal sibling-prefix trick', () => {
    expect(isPathAllowed('/home/u/app-evil/x', ['/home/u/app'])).toBe(false)
  })
  it('rejects when there are no roots', () => {
    expect(isPathAllowed('/anything', [])).toBe(false)
  })
})
