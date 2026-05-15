/**
 * LINE Webhook エンドポイント
 * POST /api/webhook
 *
 * LINE プラットフォームからのイベントを受信し、
 * 自動応答を返します。
 *
 * 対応イベント:
 *   - テキストメッセージ「空き状況」→ 最新の空き状況を返信
 *   - Postback action=vacancy  → 同上
 *   - フォロー（友だち追加）   → ウェルカムメッセージを返信
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WebhookEvent, MessageEvent, PostbackEvent, FollowEvent } from "@line/bot-sdk";
import { createLineClient, verifyLineSignature, replyText } from "../lib/lineClient";
import { fetchVacancyData } from "../lib/sheetsClient";
import { formatVacancyMessage, formatErrorMessage } from "../lib/availabilityFormatter";
import type { VacancyData } from "../lib/types";

// ────────────────────────────────────────────────────────────────
// モジュールスコープのキャッシュ
// Vercel Serverless はインスタンスが再利用されることがあるため、
// メモリキャッシュとして機能します（TTL: 5分）。
// ────────────────────────────────────────────────────────────────

let cachedVacancy: VacancyData | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

async function getVacancyData(): Promise<VacancyData> {
  const now = Date.now();
  if (cachedVacancy && now < cacheExpiresAt) {
    return cachedVacancy;
  }
  cachedVacancy = await fetchVacancyData();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedVacancy;
}

/** キャッシュを強制的に更新します（/api/refresh から呼ばれます） */
export function invalidateCache(): void {
  cachedVacancy = null;
  cacheExpiresAt = 0;
}

// ────────────────────────────────────────────────────────────────
// Vercel ハンドラー
// ────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // GET リクエストは Webhook 確認用
  if (req.method === "GET") {
    res.status(200).send("LINE Webhook is running ✅");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // ────────────────────────────────────────────────────────────
  // 署名検証
  // ────────────────────────────────────────────────────────────
  const signature = req.headers["x-line-signature"] as string;
  if (!signature) {
    res.status(401).json({ error: "Missing x-line-signature" });
    return;
  }

  // Vercel は body を自動パースするため、rawBody を再構築します
  const rawBody = JSON.stringify(req.body);
  const isValid = verifyLineSignature(Buffer.from(rawBody), signature);

  if (!isValid) {
    console.error("[webhook] 署名検証に失敗しました");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // ────────────────────────────────────────────────────────────
  // イベント処理
  // ────────────────────────────────────────────────────────────
  const events: WebhookEvent[] = req.body?.events ?? [];
  const client = createLineClient();

  // 全イベントを並列で処理（エラーは個別にキャッチ）
  await Promise.allSettled(
    events.map((event) => handleEvent(event, client))
  );

  res.status(200).json({ ok: true });
}

// ────────────────────────────────────────────────────────────────
// イベントハンドラー
// ────────────────────────────────────────────────────────────────

async function handleEvent(
  event: WebhookEvent,
  client: ReturnType<typeof createLineClient>
): Promise<void> {
  switch (event.type) {
    case "message":
      await handleMessage(event as MessageEvent, client);
      break;
    case "postback":
      await handlePostback(event as PostbackEvent, client);
      break;
    case "follow":
      await handleFollow(event as FollowEvent, client);
      break;
    default:
      // unfollow / join などは無視
      break;
  }
}

// ────────────────────────────────────────────────────────────────
// テキストメッセージ処理
// ────────────────────────────────────────────────────────────────

const VACANCY_TRIGGERS = [
  "空き状況",
  "空き",
  "あき",
  "空き情報",
  "あきじょうきょう",
  "vacancy",
];

async function handleMessage(
  event: MessageEvent,
  client: ReturnType<typeof createLineClient>
): Promise<void> {
  if (event.message.type !== "text") return;

  const text = event.message.text.trim();

  // 空き状況キーワード判定
  const isVacancyQuery = VACANCY_TRIGGERS.some((trigger) =>
    text.includes(trigger)
  );

  if (isVacancyQuery) {
    await replyVacancy(event.replyToken, client);
    return;
  }

  // その他のメッセージ（将来的に Q&A 等を追加可能）
  // 現状はガイドメッセージを返す
  await replyText(
    client,
    event.replyToken,
    [
      "メッセージありがとうございます😊",
      "",
      "「空き状況」と送るか、下のメニューからご確認いただけます。",
      "その他のご質問は、スタッフが確認次第ご返答いたします。",
    ].join("\n")
  );
}

// ────────────────────────────────────────────────────────────────
// Postback 処理（リッチメニューのタップ）
// ────────────────────────────────────────────────────────────────

async function handlePostback(
  event: PostbackEvent,
  client: ReturnType<typeof createLineClient>
): Promise<void> {
  // Postback データは "action=vacancy" 形式で受け取る
  const params = new URLSearchParams(event.postback.data);
  const action = params.get("action");

  switch (action) {
    case "vacancy":
      await replyVacancy(event.replyToken, client);
      break;

    default:
      console.warn(`[webhook] 未定義の Postback action: ${action}`);
      break;
  }
}

// ────────────────────────────────────────────────────────────────
// フォロー（友だち追加）処理
// ────────────────────────────────────────────────────────────────

async function handleFollow(
  event: FollowEvent,
  client: ReturnType<typeof createLineClient>
): Promise<void> {
  await replyText(
    client,
    event.replyToken,
    [
      "友だち追加ありがとうございます！🎉",
      "",
      "当施設の公式LINEへようこそ。",
      "以下のことができます：",
      "　📋 空き状況の確認",
      "　📅 月間予定表の閲覧",
      "　🏠 施設の紹介・見学予約",
      "　📍 アクセスのご案内",
      "",
      "「空き状況」と送るか、下のメニューをご活用ください。",
    ].join("\n")
  );
}

// ────────────────────────────────────────────────────────────────
// 空き状況返信（共通処理）
// ────────────────────────────────────────────────────────────────

async function replyVacancy(
  replyToken: string,
  client: ReturnType<typeof createLineClient>
): Promise<void> {
  try {
    const data = await getVacancyData();
    const message = formatVacancyMessage(data);
    await replyText(client, replyToken, message);
  } catch (error) {
    console.error("[webhook] 空き状況の取得に失敗しました:", error);
    await replyText(client, replyToken, formatErrorMessage());
  }
}
