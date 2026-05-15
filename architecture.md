# デイサービス向け LINE 公式アカウント運用支援ツール — 全体設計書

## 1. システム概要

現場スタッフが **Googleスプレッドシート** を更新するだけで、LINEの自動応答・リッチメニューへ即座に反映される仕組みです。ITの知識がなくても運用できる点を最優先に設計しています。

---

## 2. アーキテクチャ図

```
【更新フロー】
  現場スタッフ
      │
      ▼
 Googleスプレッドシート（曜日ごとの空き状況入力）
      │  編集トリガー
      ▼
 Google Apps Script (GAS)
      │  POST /api/refresh  （認証トークン付き）
      ▼
 Vercel Serverless API
      │  Google Sheets API で最新データ取得
      │  Edge Config / メモリキャッシュに保存
      ▼
 （完了）

【応答フロー】
  LINE ユーザー（家族 / ケアマネ）
      │  「空き状況」と送信 or メニュータップ
      ▼
 LINE Messaging API
      │  POST /api/webhook
      ▼
 Vercel Serverless API
      │  キャッシュから空き状況を取得
      │  テキスト整形して返信
      ▼
 LINE ユーザーへ返信メッセージ
```

---

## 3. ディレクトリ構成

```
line-dayservice/
├── api/
│   ├── webhook.ts          # LINE Webhook 受信エンドポイント
│   └── refresh.ts          # GAS からのキャッシュ更新エンドポイント
├── lib/
│   ├── types.ts            # 共通型定義
│   ├── lineClient.ts       # LINE Messaging API ラッパー
│   ├── sheetsClient.ts     # Google Sheets API ラッパー
│   └── availabilityFormatter.ts  # 空き状況メッセージ整形
├── scripts/
│   └── setupRichMenu.ts    # リッチメニュー一括登録スクリプト（初回のみ実行）
├── gas/
│   └── Code.gs             # Google Apps Script（スプレッドシート → Vercel 通知）
├── .env.example            # 環境変数テンプレート
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## 4. Googleスプレッドシートの構成

シート名：**空き状況**

| 列A（曜日） | 列B（状況） | 列C（残数） | 列D（備考） |
|------------|------------|------------|------------|
| 月曜日      | ◯          | 3          | 送迎あり    |
| 火曜日      | △          | 1          | —          |
| 水曜日      | ×          | 0          | 満員        |
| 木曜日      | ◯          | 4          | —          |
| 金曜日      | △          | 2          | —          |
| 土曜日      | ×          | 0          | 休業        |

**入力ルール（現場スタッフ向け）**
- 列B は `◯`（空きあり）/ `△`（残りわずか）/ `×`（満員）の3種類のみ
- 列C は残り受入可能人数（数字）
- 列D は自由備考（空欄でも可）
- 保存すると自動でLINEに反映されます ✅

---

## 5. リッチメニュー構成（6分割）

```
┌──────────────┬──────────────┬──────────────┐
│  空き状況    │   予定表     │  施設紹介    │
│（自動応答）  │（URL遷移）   │（URL遷移）   │
├──────────────┼──────────────┼──────────────┤
│  お問い合わせ│   アクセス   │    採用      │
│（電話/LINE） │（地図URL）   │（求人URL）   │
└──────────────┴──────────────┴──────────────┘
```

| ボタン       | アクション種別    | 内容                          |
|-------------|-----------------|-------------------------------|
| 空き状況     | postback        | `action=vacancy` → 自動返信   |
| 予定表       | uri             | Google カレンダー等の URL     |
| 施設紹介     | uri             | 施設紹介ページ URL            |
| お問い合わせ | uri             | LINE チャット or tel: URL     |
| アクセス     | uri             | Google マップ URL             |
| 採用         | uri             | 採用ページ URL                |

---

## 6. 環境変数一覧

| 変数名                        | 説明                                      |
|------------------------------|-------------------------------------------|
| `LINE_CHANNEL_SECRET`        | LINE チャンネルシークレット               |
| `LINE_CHANNEL_ACCESS_TOKEN`  | LINE チャンネルアクセストークン           |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | GCP サービスアカウントのメールアドレス  |
| `GOOGLE_PRIVATE_KEY`         | GCP サービスアカウントの秘密鍵（JSON）    |
| `SPREADSHEET_ID`             | 対象スプレッドシートの ID                 |
| `REFRESH_SECRET`             | GAS → Vercel 通知時の認証トークン         |

---

## 7. セットアップ手順

### ステップ 1：LINE Developers の設定
1. [LINE Developers](https://developers.line.biz/) でプロバイダー・チャンネル作成
2. Messaging API チャンネルを選択し、以下を取得：
   - チャンネルシークレット
   - チャンネルアクセストークン（長期）
3. Webhook URL に `https://あなたのVercelドメイン/api/webhook` を設定

### ステップ 2：Google Cloud の設定
1. Google Cloud Console でプロジェクト作成
2. **Google Sheets API** を有効化
3. サービスアカウントを作成し、JSON 鍵をダウンロード
4. スプレッドシートにサービスアカウントのメールを **編集者** として共有

### ステップ 3：Vercel へデプロイ
```bash
npm install
vercel env add LINE_CHANNEL_SECRET
vercel env add LINE_CHANNEL_ACCESS_TOKEN
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL
vercel env add GOOGLE_PRIVATE_KEY
vercel env add SPREADSHEET_ID
vercel env add REFRESH_SECRET
vercel deploy --prod
```

### ステップ 4：リッチメニューの登録（初回のみ）
```bash
npx ts-node scripts/setupRichMenu.ts
```
※ メニュー画像（1200×810px）を事前に用意し `assets/rich-menu.png` に配置してください。

### ステップ 5：GAS のセットアップ
1. スプレッドシートの「拡張機能」→「Apps Script」を開く
2. `gas/Code.gs` の内容を貼り付ける
3. `VERCEL_URL` と `REFRESH_SECRET` を修正する
4. 「トリガー」→「編集時」トリガーを追加する

---

## 8. 技術スタック詳細

| 区分             | 技術                       | 用途                     |
|-----------------|---------------------------|--------------------------|
| ランタイム        | Node.js 20 + TypeScript   | メインバックエンド         |
| ホスティング      | Vercel（Serverless）       | LINE Webhook 受信         |
| LINE SDK         | `@line/bot-sdk`            | Messaging API 操作        |
| Sheets 連携      | `googleapis`               | スプレッドシート読み取り   |
| 更新通知          | Google Apps Script         | 編集検知 → Vercel 通知    |
| キャッシュ        | モジュールスコープ変数       | 直近の空き状況を保持       |

---

## 9. 拡張ロードマップ（オプション）

| フェーズ | 内容                                       |
|---------|--------------------------------------------|
| Phase 2 | Canvas ライブラリで空き状況画像を自動生成    |
| Phase 3 | Vercel KV で永続キャッシュ化                |
| Phase 4 | 管理画面 UI（Next.js）の追加               |
| Phase 5 | 予約受付フォームとの連携                    |
