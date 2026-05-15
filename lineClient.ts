/**
 * LINE Messaging API クライアント ラッパー
 *
 * @line/bot-sdk を薄くラップし、よく使う操作をまとめています。
 * 署名検証もここで一元管理します。
 */

import {
  messagingApi,
  middleware,
  validateSignature,
} from "@line/bot-sdk";

// ────────────────────────────────────────────────────────────────
// クライアント初期化
// ────────────────────────────────────────────────────────────────

function getConfig() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelAccessToken || !channelSecret) {
    throw new Error(
      "LINE 環境変数が設定されていません。" +
        "LINE_CHANNEL_ACCESS_TOKEN と LINE_CHANNEL_SECRET を確認してください。"
    );
  }

  return { channelAccessToken, channelSecret };
}

/** LINE Messaging API クライアントを生成して返します */
export function createLineClient(): messagingApi.MessagingApiClient {
  const { channelAccessToken } = getConfig();
  return new messagingApi.MessagingApiClient({ channelAccessToken });
}

// ────────────────────────────────────────────────────────────────
// 署名検証
// ────────────────────────────────────────────────────────────────

/**
 * LINE プラットフォームからのリクエストか検証します。
 * 不正なリクエストは早期に弾きます。
 *
 * @param rawBody  リクエストの生ボディ（Buffer または string）
 * @param signature  x-line-signature ヘッダーの値
 */
export function verifyLineSignature(
  rawBody: Buffer | string,
  signature: string
): boolean {
  const { channelSecret } = getConfig();
  return validateSignature(rawBody, channelSecret, signature);
}

// ────────────────────────────────────────────────────────────────
// 返信ヘルパー
// ────────────────────────────────────────────────────────────────

/**
 * テキストメッセージで返信します。
 */
export async function replyText(
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  text: string
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text,
      },
    ],
  });
}

/**
 * 複数のテキストメッセージで返信します（最大 5 件）。
 */
export async function replyMultipleTexts(
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  texts: string[]
): Promise<void> {
  const messages = texts
    .slice(0, 5)
    .map((text) => ({ type: "text" as const, text }));

  await client.replyMessage({ replyToken, messages });
}

// ────────────────────────────────────────────────────────────────
// Middleware（Express/Vercel 向け）
// ────────────────────────────────────────────────────────────────

/**
 * @line/bot-sdk の middleware を返します。
 * リクエストボディのパースと署名検証を行います。
 *
 * ※ Vercel Serverless では rawBody を手動で取得するため、
 *    通常は verifyLineSignature() を直接使用してください。
 */
export function getLineMiddleware() {
  const config = getConfig();
  return middleware(config);
}
