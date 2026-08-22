# HardwareVisualizer Download Analytics

HardwareVisualizer の GitHub Release アセット別ダウンロード数を日次で保存し、期間増分や推移を分析するダッシュボードです。

![Hono](https://img.shields.io/badge/Hono-4.13-E36002?logo=hono&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![D1](https://img.shields.io/badge/Database-D1-F38020)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)

## できること

- GitHub Releases API から全リリースと全アセットの累積 `download_count` を取得
- Cloudflare Cron Triggers で毎日 00:10 JST に自動収集
- D1 に日次スナップショットを保存し、前回値との差を算出
- 7日、30日、90日、1年の表示切り替え
- 安定版のみ、プレリリースを含む、の切り替え
- インストーラー、配布物全体、全アセット、の切り替え
- 日次増分、7日移動平均、累積推移、前期間比を表示
- 日次チャートにリリース公開日を表示
- OS ごとの日次増分を積み上げ推移で表示
- installer と updater の日次推移・期間合計を比較し、新規獲得と既存利用の動きを近似
- 最新バージョンが期間内ダウンロードに占める比率を表示
- OS別、アーキテクチャ別、リリース別、配布ファイル別の内訳を表示
- 公開日を Day 0 に揃え、直近リリースの累積ダウンロード採用曲線を比較
- 欠損日を検出し、複数日分の差分を1日の値として誤表示しない
- 削除または差し替えられたアセットの最終値を持ち越し、累計の見かけ上の減少を防止

## 構成

```text
GitHub Releases API
        │
        │ cumulative download_count
        ▼
Cloudflare Worker + Hono
        │
        ├── Cron: 10 15 * * *  (00:10 JST)
        ├── POST /api/admin/collect
        ├── GET  /api/dashboard
        └── GET  /            (hono/jsx SSR)
        │
        ▼
Cloudflare D1
  releases / assets / snapshots / collection_runs
        │
        ▼
Server-rendered dashboard
  hono/jsx + CSS + inline SVG charts
```

ダッシュボードは Worker が `hono/jsx` でサーバーサイドレンダリングします。ブラウザに配信する JavaScript はゼロで、バンドラーも使いません。期間・チャンネル・集計対象の絞り込みはすべてクエリ文字列付きのリンクなので、状態は URL だけが持ちます。チャートは外部ライブラリなしの手書き SVG です。

## 重要な集計仕様

GitHub API が返すのは、各 Release Asset の現在時点の累積ダウンロード数です。日次履歴そのものは返されません。そのため、初回収集時の値を基準値として保存し、2回目以降の差分を日次値として扱います。

つまり、**デプロイ前の過去の日次推移は復元できません**。初回スナップショットの累積値を初日のダウンロードとして誤計上しない実装にしています。

また、ダウンロード数はユニークユーザー数ではありません。同じ利用者の再ダウンロード、自動更新クライアント、CI、ボットなどが含まれる可能性があります。

### 集計対象

| スコープ | 対象 |
|---|---|
| `installers` | `.exe`, `.msi`, `.dmg`, `.pkg`, `.AppImage`, `.deb`, `.rpm` |
| `distribution` | インストーラー、更新用バンドル、一般アーカイブ |
| `all` | 署名、チェックサム、メタデータを含む全アセット |

画面の既定値は `installers` です。自動更新用ファイルや `.sig` が手動インストール数に混ざるのを避けています。

## ローカルでデモ画面を確認

Cloudflare アカウントもネットワークも不要で、合成データを入れたローカル D1 に対して本番と同じ Worker を動かせます。

```bash
npm run preview:demo
```

マイグレーションと `seed/demo.sql` の投入を済ませてから `wrangler dev` を起動します。ブラウザで `http://localhost:8787` を開いてください。シードは約90日分なので、`1年` 表示は観測できた範囲だけを描画します。

## ローカル開発

### 1. 依存関係をインストール

```bash
npm install
```

### 2. ローカル用の環境変数を作成

```bash
cp .dev.vars.example .dev.vars
```

`COLLECT_TOKEN` は手動収集 API の認証に使います。`GITHUB_TOKEN` はローカル開発では省略できますが、本番では必須です。理由は「Secret を設定」の項に記載しています。

### 3. D1 マイグレーションを適用

```bash
npm run db:migrate:local
```

画面確認用の合成データを入れる場合は次を実行します。

```bash
npm run db:seed:local
```

### 4. Worker を起動

```bash
npm run dev
```

`--test-scheduled` を付けて起動するため、Wrangler の Scheduled Event テストエンドポイントも利用できます。

### 5. 実データを手動収集

`.dev.vars` の `COLLECT_TOKEN` を使います。

```bash
curl -X POST http://localhost:8787/api/admin/collect \
  -H 'Authorization: Bearer local-development-token'
```

## Cloudflare へデプロイ

### 1. D1 データベースを作成

```bash
npm run db:create
```

出力された `database_id` を `wrangler.jsonc` の次の箇所へ設定します。

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "hardwarevisualizer-downloads",
      "database_id": "ここへ実際のIDを設定"
    }
  ]
}
```

### 2. リモート D1 にマイグレーションを適用

```bash
npm run db:migrate:remote
```

### 3. Secret を設定

```bash
npx wrangler secret put COLLECT_TOKEN
npx wrangler secret put GITHUB_TOKEN
```

安全な収集トークンは、例えば次のように生成できます。

```bash
openssl rand -hex 32
```

`GITHUB_TOKEN` は **Cloudflare Workers では実質必須** です。GitHub の未認証レート制限は送信元 IP ごとに1時間あたり60リクエストですが、Workers の外向き IP は他の多数の利用者と共有されるため、この枠は自分が使う前に消費されています。未設定のまま収集すると 403 `API rate limit exceeded` で失敗します。

公開リポジトリのみを対象とするため、必要な権限はごく僅かです。Fine-grained personal access token なら Public Repositories の読み取りのみ、classic token ならスコープを一切付与しない状態で構いません。いずれの場合も認証済み扱いとなり、上限が1時間あたり5,000リクエストに上がります。

### 4. デプロイ

```bash
npm run deploy
```

### 5. 初回収集

初回収集が基準スナップショットになります。

```bash
curl -X POST https://YOUR_WORKER_DOMAIN/api/admin/collect \
  -H 'Authorization: Bearer YOUR_COLLECT_TOKEN'
```

以後は `wrangler.jsonc` の Cron Trigger により、毎日 15:10 UTC、つまり 00:10 JST に収集されます。

## GitHub Actions での自動デプロイ

`.github/workflows/deploy.yml` により、`main` へ push すると型チェック、Biome、テストを実行し、通過した場合のみ D1 マイグレーションの適用と Worker のデプロイを行います。Pull Request では検証のみ実行し、デプロイはしません。

マイグレーションはデプロイより先に実行します。スキーマが無い状態で Worker を公開すると、全リクエストが 500 になるためです。

### 必要な GitHub Secrets

リポジトリの Settings、Secrets and variables、Actions から次の2つを登録します。

| 名前 | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers と D1 の編集権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | デプロイ先アカウントの ID |

API トークンは Cloudflare ダッシュボードの My Profile、API Tokens から、Edit Cloudflare Workers テンプレートを基に作成します。D1 の編集権限を含めてください。

`COLLECT_TOKEN` と `GITHUB_TOKEN` は Worker 側の Secret です。GitHub Secrets ではなく `npx wrangler secret put` で登録します。デプロイでは上書きされないため、登録は初回のみで済みます。

## API

### `GET /api/dashboard`

クエリ:

| 名前 | 値 | 既定値 |
|---|---|---|
| `days` | `7`, `30`, `90`, `365` | `30` |
| `channel` | `stable`, `all` | `stable` |
| `scope` | `installers`, `distribution`, `all` | `installers` |

例:

```text
GET /api/dashboard?days=30&channel=stable&scope=installers
```

### `GET /api/health`

D1 接続と基本設定を確認します。Secret は返しません。

### `POST /api/admin/collect`

GitHub の現在値を取得して、その日のスナップショットを作成または更新します。

```http
Authorization: Bearer <COLLECT_TOKEN>
```

同じ日に複数回実行した場合は、その日のレコードを最新値で更新します。

## データモデル

### `releases`

GitHub Release のタグ、公開日時、プレリリース状態を保持します。

### `assets`

GitHub Release Asset と、自動判定した OS、アーキテクチャ、配布物種別を保持します。

### `snapshots`

`(snapshot_date, asset_id)` を主キーに、その日の累積 `download_count` を保持します。

### `collection_runs`

収集開始、終了、成功または失敗、取得件数、処理時間、エラー概要を保持します。

## 品質チェック

```bash
npm run typecheck
npm run check
npm test
```

主なテスト対象:

- OS、アーキテクチャ、アセット種別の分類
- JST での日付境界
- 初回累積値を期間ダウンロードへ含めないこと
- 欠損日をまたぐ差分を1日分として扱わないこと
- 前期間比の計算

## ファイル構成

```text
.
├── .github/workflows/deploy.yml
├── migrations/0001_initial.sql
├── public/            静的アセットのみ (CSS, アイコン, _headers)
│   └── styles.css
├── seed/demo.sql
├── src/
│   ├── index.ts
│   ├── lib/
│   │   ├── analytics.ts
│   │   ├── assets.ts
│   │   ├── collector.ts
│   │   ├── date.ts
│   │   ├── github.ts
│   │   ├── query.ts     クエリの解析とリンク生成
│   │   └── security.ts  Worker 応答のセキュリティヘッダ
│   ├── routes/
│   │   ├── api.ts
│   │   └── page.tsx     GET / の SSR
│   └── views/           hono/jsx コンポーネント
│       ├── Charts.tsx
│       ├── Controls.tsx
│       ├── DashboardPage.tsx
│       ├── Layout.tsx
│       └── format.ts
├── tests/
│   └── fixtures/dashboard.ts   合成データ
└── wrangler.jsonc
```

## 運用上の注意

- Cron Trigger の時刻は UTC です。
- 本番では `GITHUB_TOKEN` を必ず設定してください。未認証のレート制限は送信元 IP 単位で、Workers の外向き IP は共有されているため、未設定だと 403 で収集が失敗します。ローカル開発では自宅などの専有 IP から発信するため未設定でも成功しますが、本番で同じとは限りません。
- `GITHUB_TOKEN` を設定する場合は必ず有効な値にしてください。無効な値を入れると GitHub が全リクエストを 401 で拒否し、未設定の場合より状況が悪化します。
- 日次グラフの日付は、スナップショットを取得した日です。00:10 JST に収集するため、ある日付のバーはおおむね前日中のダウンロードを表します。
- 収集が1日以上欠けた場合、期間合計には差分を含めますが、日次グラフでは欠損をまたぐ値を表示しません。
- GitHub 上でリリースを削除して同じタグで作り直すと、新しい Release ID の行が追加されます。旧行と旧アセットは履歴保持のために残し、リリース別の表示ではタグ単位で合算します。
- アセットのファイル名規則が変わった場合は `src/lib/assets.ts` の分類ルールを更新してください。
- スタイルシートは `/styles.css?v=<内容ハッシュ>` として読み込みます。バージョンは Workers Assets が返す ETag から取得し、Worker の isolate 単位でメモ化します。CSS を変更すると URL が変わるため、古いキャッシュを持つブラウザに新しい HTML と古い CSS が同時に届くことはありません。`public/styles.css` を編集する際に手作業でのバージョン更新は不要です。
- `public/_headers` は Assets バインディングが直接返すファイルにしか適用されません。`/` は Worker が返すため、同等のヘッダを `src/lib/security.ts` で付けています。CSP を変更するときは両方を更新してください。
- `scope=all` は署名や更新メタデータも含むため、利用者数の近似には向きません。
