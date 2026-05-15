/**
 * Google Sheets API クライアント
 *
 * スプレッドシートから空き状況データを取得し、
 * VacancyData 型に変換して返します。
 */

import { google } from "googleapis";
import type { DayVacancy, VacancyData, VacancyStatus } from "./types";

// ────────────────────────────────────────────────────────────────
// 認証クライアントの初期化
// ────────────────────────────────────────────────────────────────

function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    throw new Error(
      "Google サービスアカウントの環境変数が設定されていません。" +
        "GOOGLE_SERVICE_ACCOUNT_EMAIL と GOOGLE_PRIVATE_KEY を確認してください。"
    );
  }

  return new google.auth.JWT({
    email,
    // Vercel 環境変数では \n がエスケープされる場合があるため置換
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

// ────────────────────────────────────────────────────────────────
// スプレッドシートからのデータ取得
// ────────────────────────────────────────────────────────────────

/**
 * スプレッドシートの「空き状況」シートを読み取り、
 * VacancyData を返します。
 *
 * シートの列構成:
 *   A: 曜日  B: 状況（◯/△/×）  C: 残数  D: 備考
 */
export async function fetchVacancyData(): Promise<VacancyData> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetName = process.env.SHEET_NAME ?? "空き状況";

  if (!spreadsheetId) {
    throw new Error(
      "SPREADSHEET_ID が環境変数に設定されていません。"
    );
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  // A2:D8 — ヘッダー行を除いた最大 7 行（月〜日）を取得
  const range = `${sheetName}!A2:D8`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values ?? [];

  const days: DayVacancy[] = rows
    .filter((row) => row[0] && row[1]) // 曜日・状況が空欄の行をスキップ
    .map((row) => {
      const status = normalizeStatus(String(row[1] ?? "").trim());
      const remaining = parseInt(String(row[2] ?? "0").trim(), 10);
      const note = row[3] ? String(row[3]).trim() : undefined;

      return {
        day: String(row[0]).trim(),
        status,
        remaining: isNaN(remaining) ? 0 : remaining,
        note,
      } satisfies DayVacancy;
    });

  return {
    days,
    updatedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────────────────────────

/**
 * セルの値をステータスに正規化します。
 * 全角・半角・表記ゆれに対応します。
 */
function normalizeStatus(raw: string): VacancyStatus {
  if (raw === "◯" || raw === "○" || raw.toLowerCase() === "o") return "◯";
  if (raw === "△" || raw === "▲") return "△";
  if (raw === "×" || raw === "✕" || raw === "x" || raw === "X") return "×";
  // 不明な値はデフォルト「×」として安全側に
  console.warn(`[sheetsClient] 不明なステータス値: "${raw}" → "×" として扱います`);
  return "×";
}
