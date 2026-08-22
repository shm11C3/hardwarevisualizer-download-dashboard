import type { Architecture, AssetKind, Platform } from '../types'

export interface AssetClassification {
  platform: Platform
  architecture: Architecture
  kind: AssetKind
  isSignature: boolean
}

const SIGNATURE_PATTERN = /(?:\.sig|\.asc|\.pem|\.crt|\.minisig)$/i
const CHECKSUM_PATTERN = /(?:^|[-_.])(?:sha(?:1|224|256|384|512)?|checksums?)(?:[-_.]|$)/i
const METADATA_PATTERN = /(?:sbom|attestation|provenance|\.json$|\.xml$)/i

export function classifyPlatform(name: string): Platform {
  const normalized = name.toLowerCase()

  if (/(?:\.exe|\.msi|windows|win32|win64|nsis|setup)/i.test(normalized)) {
    return 'windows'
  }

  if (/(?:\.dmg|\.pkg|macos|darwin|\.app(?:\.|$))/i.test(normalized)) {
    return 'macos'
  }

  if (/(?:\.appimage|\.deb|\.rpm|linux)/i.test(normalized)) {
    return 'linux'
  }

  return 'unknown'
}

export function classifyArchitecture(name: string): Architecture {
  const normalized = name.toLowerCase()

  if (/(?:universal|universal2|fat-binary)/i.test(normalized)) {
    return 'universal'
  }

  if (/(?:aarch64|arm64|armv8)/i.test(normalized)) {
    return 'arm64'
  }

  if (/(?:x86_64|amd64|x64)/i.test(normalized)) {
    return 'x64'
  }

  if (/(?:^|[-_.])(?:i[3-6]86|x86)(?:[-_.]|$)/i.test(normalized)) {
    return 'x86'
  }

  return 'unknown'
}

export function classifyKind(name: string): AssetKind {
  const normalized = name.toLowerCase()

  if (
    SIGNATURE_PATTERN.test(normalized) ||
    CHECKSUM_PATTERN.test(normalized) ||
    METADATA_PATTERN.test(normalized)
  ) {
    return 'metadata'
  }

  if (
    /(?:updater?|update-bundle|\.app\.tar\.gz|\.appimage\.tar\.gz|\.nsis\.zip)$/i.test(normalized)
  ) {
    return 'updater'
  }

  if (/(?:\.exe|\.msi|\.dmg|\.pkg|\.appimage|\.deb|\.rpm)$/i.test(normalized)) {
    return 'installer'
  }

  if (/(?:\.zip|\.tar\.gz|\.tgz|\.tar\.xz|\.7z)$/i.test(normalized)) {
    return 'archive'
  }

  return 'other'
}

export function classifyAsset(name: string): AssetClassification {
  return {
    platform: classifyPlatform(name),
    architecture: classifyArchitecture(name),
    kind: classifyKind(name),
    isSignature: SIGNATURE_PATTERN.test(name.toLowerCase()),
  }
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'windows':
      return 'Windows'
    case 'macos':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return 'その他'
  }
}
