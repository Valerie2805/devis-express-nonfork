import { describe, expect, it, vi, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadSpecs } from './specs'

describe('loadSpecs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('charge les specs via un chemin stable (pas dépendant de cwd)', () => {
    const prev = process.cwd()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mad-cwd-'))
    process.chdir(tmp)

    const reads: string[] = []
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
      reads.push(String(p))
      return '{}'
    })

    try {
      loadSpecs()
    } finally {
      process.chdir(prev)
      fs.rmSync(tmp, { recursive: true, force: true })
    }

    expect(reads.length).toBeGreaterThanOrEqual(6)
    expect(reads.some((p) => p.includes(`${path.sep}machine-a-devis${path.sep}content${path.sep}fr${path.sep}site_copy.yml`))).toBe(true)
  })
})

