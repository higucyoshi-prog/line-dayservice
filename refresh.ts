/**
 * キャッシュ更新エンドポイント
 * POST /api/refresh
 *
 * Google Apps Script（GAS）からスプレッドシートの編集を検知した際に
 * 呼び出されます。キャッシュを無効化して最新データを取得します。
 *
 * セキュリティ:
 *   Authorization: Bearer <REFRESH_SECRET> ヘッダーで認証します。
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { invalidateCache } from "./webhook";
import { fetchVacancyData } from "../lib/sheetsClient";
import type { RefreshResponse } from "../lib/types";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method Not Allowed" });
    return;
  }

  // ────────────────────────────────────────────────────────────
  // 認証チェック
  // ────────────────────────────────────────────────────────────
  const secret = process.env.REFRESH_SECRET;
  if (!secret) {
    console.error("[refresh] REFRESH_SECRET が設定されていません");
    res.status(500).json({ success: false, message: "Server configuration error" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const providedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (providedToken !== secret) {
    console.warn("[refresh] 認証失敗 — 不正なトークン");
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  // ────────────────────────────────────────────────────────────
  // キャッシュ無効化 → 最新データを取得
  // ────────────────────────────────────────────────────────────
  try {
    invalidateCache();
    const freshData = await fetchVacancyData();

    const response: RefreshResponse = {
      success: true,
      message: `空き状況キャッシュを更新しました（${freshData.days.length} 曜日）`,
      updatedAt: freshData.updatedAt,
    };

    console.info("[refresh] キャッシュを更新しました:", response);
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[refresh] データ更新に失敗しました:", message);

    const response: RefreshResponse = {
      success: false,
      message: `更新に失敗しました: ${message}`,
    };
    res.status(500).json(response);
  }
}
