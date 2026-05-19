/**
 * LINE Webhook エンドポイント — all-in-one 版
 * POST /api/webhook
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { messagingApi, validateSignature } from "@line/bot-sdk";
import { google } from "googleapis";
 
// ── 型定義 ──────────────────────────────────────────────────────
type VacancyStatus = "◯" | "△" | "×";
interface DayVacancy { day: string; status: VacancyStatus; remaining: number; note?: string; }
interface VacancyData { days: DayVacancy[]; updatedAt: string; }
 
// ── キャッシュ ───────────────────────────────────────────────────
let cachedVacancy: VacancyData | null = null;h
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
export function invalidateCache() { cachedVacancy = null; cacheExpiresAt = 0; }
 
// ── Google Sheets からデータ取得 ─────────────────────────────────
async function fetchVacancyData(): Promise<VacancyData> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.SPREADSHEET_ID!;
  const sheetName = process.env.SHEET_NAME ?? "空き状況";
  const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A2:D8` });
  const rows = res.data.values ?? [];
  const days: DayVacancy[] = rows.filter(r => r[0] && r[1]).map(r => {
    const raw = String(r[1] ?? "").trim();
        const isCircle = ["◯", "○", "〇", "O", "Ｏ"].includes(raw);
       const isTriangle = ["△", "▲"].includes(raw);
       const status: VacancyStatus = isCircle ? "◯" : isTriangle ? "△" : "×";
    const remaining = parseInt(String(r[2] ?? "0"), 10);
    return { day: String(r[0]).trim(), status, remaining: isNaN(remaining) ? 0 : remaining, note: r[3] ? String(r[3]).trim() : undefined };
  });
  return { days, updatedAt: new Date().toISOString() };
}
 
async function getVacancyData(): Promise<VacancyData> {
  const now = Date.now();
  if (cachedVacancy && now < cacheExpiresAt) return cachedVacancy;
  cachedVacancy = await fetchVacancyData();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedVacancy;
}
 
// ── メッセージ整形 ───────────────────────────────────────────────
function formatVacancyMessage(data: VacancyData): string {
  const sep = "━━━━━━━━━━━━━━━━━━━━";
  const d = new Date(data.updatedAt);
  const updated = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const lines = data.days.map(v => {
    const remain = v.status === "×" ? "満員" : v.remaining <= 0 ? "残りわずか" : `残り${v.remaining}名`;
    const note = v.note ? `  ※${v.note}` : "";
    return `${v.day.padEnd(4,"　")}${v.status}  ${remain}${note}`;
  });
  return [sep, "📋 空き状況（最新情報）", sep, ...lines, sep, `更新: ${updated}`, "", "ご見学・お問い合わせはお気軽にどうぞ😊"].join("\n");
}
 
// ── LINE クライアント ────────────────────────────────────────────
function getClient() {
  return new messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN! });
}
async function replyText(replyToken: string, text: string) {
  await getClient().replyMessage({ replyToken, messages: [{ type: "text", text }] });
}
 
const VACANCY_TRIGGERS = ["空き状況", "空き", "あき", "空き情報", "vacancy"];
 
async function replyVacancy(replyToken: string) {
  try {
    const data = await getVacancyData();
    await replyText(replyToken, formatVacancyMessage(data));
  } catch (e) {
    console.error(e);
    await replyText(replyToken, "申し訳ございません🙇\n現在、空き状況を取得できませんでした。\nお急ぎの場合は直接お電話ください。");
  }
}
 
// ── Vercel ハンドラー ────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") { res.status(200).send("LINE Webhook is running ✅"); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }
  const signature = req.headers["x-line-signature"] as string;
  if (!signature || !validateSignature(JSON.stringify(req.body), process.env.LINE_CHANNEL_SECRET!, signature)) {
    res.status(401).json({ error: "Invalid signature" }); return;
  }
  const events: any[] = req.body?.events ?? [];
  await Promise.allSettled(events.map(async (event) => {
    const token = event.replyToken;
    if (event.type === "message" && event.message?.type === "text") {
      const text: string = event.message.text.trim();
      if (VACANCY_TRIGGERS.some(t => text.includes(t))) {
        await replyVacancy(token);
      } else {
        await replyText(token, "メッセージありがとうございます😊\n「空き状況」と送るか、下のメニューからご確認いただけます。");
      }
    } else if (event.type === "postback") {
      const params = new URLSearchParams(event.postback?.data ?? "");
      if (params.get("action") === "vacancy") await replyVacancy(token);
    } else if (event.type === "follow") {
      await replyText(token, "友だち追加ありがとうございます！🎉\n\n当施設の公式LINEへようこそ。\n\n「空き状況」と送るか、下のメニューをご活用ください😊");
    }
  }));
  res.status(200).json({ ok: true });
}
