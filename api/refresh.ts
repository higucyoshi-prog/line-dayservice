/**
 * キャッシュ更新エンドポイント — all-in-one 版
 * POST /api/refresh
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";
import { invalidateCache } from "./webhook";
 
async function fetchCount() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.SPREADSHEET_ID!;
  const sheetName = process.env.SHEET_NAME ?? "空き状況";
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A2:D8` });
  return (res.data.values ?? []).filter(r => r[0] && r[1]).length;
}
 
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method Not Allowed" }); return; }
  const secret = process.env.REFRESH_SECRET;
  if (!secret) { res.status(500).json({ success: false, message: "Server configuration error" }); return; }
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (token !== secret) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  try {
    invalidateCache();
    const count = await fetchCount();
    const updatedAt = new Date().toISOString();
    res.status(200).json({ success: true, message: `キャッシュを更新しました（${count}曜日）`, updatedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ success: false, message: `更新に失敗しました: ${msg}` });
  }
}
 
