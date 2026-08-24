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
- リポジトリのスター・フォーク数と GitHub Traffic（views / clones）を日次保存し、注目度の推移を表示
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
- 表示中の日次・累積データを CSV / JSON でエクスポート
- 曜日ごとの平均と、累計マイルストーン・連続観測日数を表示
- 欠損日を検出し、複数日分の差分を1日の値として誤表示しない
- 削除または差し替えられたアセットの最終値を持ち越し、累計の見かけ上の減少を防止

## 構成

```text
GitHub APIs (Releases / Repository / Traffic)
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
  releases / assets / snapshots / repo_stats / collection_runs
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

Release、スター、フォークの収集だけなら公開リポジトリの読み取り権限で足ります。GitHub Traffic API の views / clones には対象リポジトリへの push 権限が必要なため、Fine-grained personal access token では追加の権限設定が必要です。

#### Traffic API 用に `GITHUB_TOKEN` をアップグレード

1. GitHub の Settings、Developer settings、Personal access tokens、Fine-grained tokens からトークンを新規作成または再作成する
2. Repository access で対象の `HardwareVisualizer` リポジトリを選ぶ
3. Repository permissions の **Administration** を **Read-only** にする
4. `npx wrangler secret put GITHUB_TOKEN` を実行し、新しいトークンへ差し替える

権限が不足して Traffic API が 403 を返しても、ダウンロードとスター・フォークの収集は継続します。その場合、画面にはスターだけを表示し、トラフィックに必要な権限を案内します。Traffic API が返す日別データは直近14日分だけで、それより前はバックフィルできません。早く収集を開始するほど長い履歴を残せます。

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

## GitHub Actions での CI とデプロイ

検証と公開は別のワークフローに分かれています。

| ワークフロー | 起動条件 | 内容 |
|---|---|---|
| `.github/workflows/ci.yml` | Pull Request と `main` への push | 型チェック、Biome、テスト |
| `.github/workflows/deploy.yml` | `main` の CI が成功したとき | D1 マイグレーション適用、Worker デプロイ |

デプロイは push ではなく CI の完了イベントを受けて起動し、CI が失敗した回は実行されません。分離しても未検証のコードが公開されないようにするためです。チェックアウトは CI が検証したコミットの SHA を明示的に指定します。既定の挙動ではデプロイ時点のブランチ先端を取得してしまい、検証したものと別のコードを公開しかねないためです。

マイグレーションはデプロイより先に実行します。スキーマが無い状態で Worker を公開すると、全リクエストが 500 になるためです。

`workflow_dispatch` で手動デプロイもできます。この場合は CI の成功を待ちません。

### 必要な GitHub Secrets

リポジトリの Settings、Secrets and variables、Actions から次の2つを登録します。

| 名前 | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers と D1 の編集権限を持つ API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | デプロイ先アカウントの ID |

API トークンは Cloudflare ダッシュボードの My Profile、API Tokens から、Edit Cloudflare Workers テンプレートを基に作成します。D1 の編集権限を含めてください。

`COLLECT_TOKEN` と `GITHUB_TOKEN` は Worker 側の Secret です。GitHub Secrets ではなく `npx wrangler secret put` で登録します。デプロイでは上書きされないため、登録は初回のみで済みます。

## 依存関係の自動更新

`.github/dependabot.yml` により、毎週月曜 09:00 JST に npm と GitHub Actions の更新 PR が作成されます。マイナーとパッチは本番用と開発用にまとめられ、メジャーは個別の PR になります。

`.github/workflows/dependabot-auto-merge.yml` は、メジャー以外の Dependabot PR に auto-merge を予約します。auto-merge は即座にマージするのではなく、必須チェックが全て通った時点で GitHub がマージする仕組みです。つまり CI の verify ジョブ、型チェックと Biome とテストが成功しない限りマージされません。メジャー更新は変更履歴を読んでから手動でマージします。

### 有効化に必要なリポジトリ設定

auto-merge は次の2つが揃っていないと機能しません。どちらも欠けると、ワークフローは PR にマージ予約を入れられずに失敗します。

| 場所 | 設定 |
|---|---|
| Settings、General、Pull Requests | Allow auto-merge を有効化 |
| Settings、Rules または Branches | `main` に対して `CI / Typecheck, lint, test` を必須チェックに指定 |

必須チェックを指定していない状態では、auto-merge は待つ対象が無いため予約できません。テストを待たずにマージされる事故を防ぐ意味でも、ブランチ保護は必須です。

`dependabot.yml` で指定するラベルは、Dependabot が自分で作ることはありません。リポジトリに存在しないラベル名を書くと設定エラーになるため、`dependencies` と `github-actions` をあらかじめ作成してあります。

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

### `repo_stats`

日付ごとのスター・フォーク累積値と、GitHub Traffic API が返す views / clones の count・uniques を保持します。スター・フォークは JST の収集日、Traffic は GitHub が返す UTC 日付をキーに保存し、取得できなかった項目は `NULL` のまま残します。

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
├── .github/
│   ├── dependabot.yml
│   └── workflows/     ci.yml, deploy.yml, dependabot-auto-merge.yml
├── migrations/
│   ├── 0001_initial.sql
│   └── 0002_repo_stats.sql
├── public/            静的アセットのみ (CSS, アイコン, _headers)
│   └── styles.css
├── seed/demo.sql
├── src/
│   ├── index.ts
│   ├── lib/
│   │   ├── analytics.ts
│   │   ├── assets.ts
│   │   ├── canonical.ts <link rel="canonical"> の URL 決定
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
- Traffic API は直近14日分だけを返します。収集停止中に14日を超えて失われた views / clones の日別履歴は復元できません。
- `GITHUB_TOKEN` を設定する場合は必ず有効な値にしてください。無効な値を入れると GitHub が全リクエストを 401 で拒否し、未設定の場合より状況が悪化します。
- 日次グラフの日付は、スナップショットを取得した日です。00:10 JST に収集するため、ある日付のバーはおおむね前日中のダウンロードを表します。
- 収集が1日以上欠けた場合、期間合計には差分を含めますが、日次グラフでは欠損をまたぐ値を表示しません。
- GitHub 上でリリースを削除して同じタグで作り直すと、新しい Release ID の行が追加されます。旧行と旧アセットは履歴保持のために残し、リリース別の表示ではタグ単位で合算します。
- アセットのファイル名規則が変わった場合は `src/lib/assets.ts` の分類ルールを更新してください。
- スタイルシートは `/styles.css?v=<内容ハッシュ>` として読み込みます。バージョンは Workers Assets が返す ETag から取得し、Worker の isolate 単位でメモ化します。CSS を変更すると URL が変わるため、古いキャッシュを持つブラウザに新しい HTML と古い CSS が同時に届くことはありません。`public/styles.css` を編集する際に手作業でのバージョン更新は不要です。
- `<link rel="canonical">` は常に `/` を指します。期間・チャンネル・集計対象の絞り込みは同じデータの別ビューであり、`?t=` はキャッシュ回避用のため、URL 違いを1つの正規 URL にまとめて Search Console の重複扱いを防ぎます。オリジンは既定でリクエスト元を使います。独自ドメインと `*.workers.dev` の両方で応答する場合は、`wrangler.jsonc` の `vars` に `CANONICAL_ORIGIN` を設定してください。未設定だと各ホストが自分自身を canonical として宣言し、重複が解消されません。404 ページには canonical を出しません。
- `public/_headers` は Assets バインディングが直接返すファイルにしか適用されません。`/` は Worker が返すため、同等のヘッダを `src/lib/security.ts` で付けています。CSP を変更するときは両方を更新してください。
- `/`、`/api/dashboard`、`/api/export.csv` は、正規化したクエリ単位で最大5分間、エッジ（Cache API）と isolate メモリにキャッシュされます。画面の「更新」リンクが付与する `t` パラメータは、従来どおり両方のキャッシュをバイパスします。Cache API はカスタムドメインで確実に機能し、workers.dev では主に isolate メモリキャッシュが機能します。
- `scope=all` は署名や更新メタデータも含むため、利用者数の近似には向きません。
