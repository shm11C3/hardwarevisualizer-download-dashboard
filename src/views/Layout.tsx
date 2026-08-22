import { raw } from 'hono/html'
import type { PropsWithChildren } from 'hono/jsx'

const GITHUB_ICON_PATH =
  'M12 .7A11.3 11.3 0 0 0 8.4 22.8c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z'

const DESCRIPTION =
  'HardwareVisualizer の GitHub Release ダウンロードを日次で記録し、推移を分析するダッシュボード'

export function Layout({ children }: PropsWithChildren) {
  return (
    <>
      {raw('<!doctype html>')}
      <html lang="ja">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="description" content={DESCRIPTION} />
          <meta name="theme-color" content="#0d1220" />
          <title>HardwareVisualizer Download Analytics</title>
          <link rel="icon" href="/favicon.ico" sizes="any" />
          <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
          <link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="manifest" href="/manifest.webmanifest" />
          <link rel="stylesheet" href="/styles.css" />
        </head>
        <body>
          <div class="ambient ambient-one" aria-hidden="true" />
          <div class="ambient ambient-two" aria-hidden="true" />

          <header class="site-header">
            <a class="brand" href="/" aria-label="HardwareVisualizer Download Analytics ホーム">
              <img src="/app-icon.png" width="38" height="38" alt="" />
              <span>
                <strong>HardwareVisualizer</strong>
                <small>Download Analytics</small>
              </span>
            </a>
            <nav class="header-links" aria-label="関連リンク">
              <a href="https://hardviz.com/ja/" target="_blank" rel="noreferrer">
                公式サイト
              </a>
              <a
                class="github-link"
                href="https://github.com/shm11C3/HardwareVisualizer"
                target="_blank"
                rel="noreferrer"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={GITHUB_ICON_PATH} />
                </svg>
                GitHub
              </a>
            </nav>
          </header>

          <main class="page-shell">{children}</main>

          <footer class="site-footer">
            <p>HardwareVisualizer Download Analytics</p>
            <p>Hono · Cloudflare Workers · D1</p>
          </footer>
        </body>
      </html>
    </>
  )
}
