import { describe, expect, it } from 'vitest'
import { classifyAsset } from '../src/lib/assets'

describe('classifyAsset', () => {
  it.each([
    ['HardwareVisualizer_1.9.2_x64-setup.exe', 'windows', 'x64', 'installer'],
    ['HardwareVisualizer_1.9.2_aarch64.dmg', 'macos', 'arm64', 'installer'],
    ['HardwareVisualizer_1.9.2_amd64.AppImage', 'linux', 'x64', 'installer'],
    ['HardwareVisualizer_1.9.2_amd64.deb', 'linux', 'x64', 'installer'],
    ['HardwareVisualizer.app.tar.gz', 'macos', 'unknown', 'updater'],
    ['HardwareVisualizer_1.9.2_x64-setup.exe.sig', 'windows', 'x64', 'metadata'],
  ] as const)(
    'classifies %s',
    (name: string, platform: string, architecture: string, kind: string) => {
      expect(classifyAsset(name)).toMatchObject({ platform, architecture, kind })
    },
  )

  it('marks signature files separately', () => {
    expect(classifyAsset('HardwareVisualizer.AppImage.sig').isSignature).toBe(true)
  })
})
