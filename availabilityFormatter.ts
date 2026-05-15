/**
 * 空き状況メッセージ整形ユーティリティ
 *
 * VacancyData を受け取り、LINE に返信する
 * テキストメッセージを生成します。
 */

import type { VacancyData, DayVacancy, VacancyStatus } from "./types";

// ────────────────────────────────────────────────────────────────
// メインのフォーマッター
// ────────────────────────────────────────────────────────────────

/**
 * 全曜日の空き状況を一覧テキストに整形します。
 *
 * 例:
 * ━━━━━━━━━━━━━━━━━━━━
 * 📋 空き状況（最新情報）
 * ━━━━━━━━━━━━━━━━━━━━
 * 月曜日  ◯  残り3名
 * 火曜日  △  残り1名
 * 水曜日  ×  満員
 * ━━━━━━━━━━━━━━━━━━━━
 * 更新: 2024/05/15 10:30
 */
export function formatVacancyMessage(data: VacancyData): string {
  const separator = "━━━━━━━━━━━━━━━━━━━━";
  const updatedAt = formatDate(data.updatedAt);

  const lines = data.days.map((d) => formatDayLine(d));

  return [
    separator,
    "📋 空き状況（最新情報）",
    separator,
    ...lines,
    separator,
    `更新: ${updatedAt}`,
    "",
    "ご見学・お問い合わせはお気軽にどうぞ😊",
  ].join("\n");
}

/**
 * 1 曜日分の行を整形します。
 * 例: "月曜日  ◯  残り3名"
 */
function formatDayLine(day: DayVacancy): string {
  const icon = statusIcon(day.status);
  const remainText = formatRemaining(day.status, day.remaining);
  const noteText = day.note ? `  ※${day.note}` : "";

  // 曜日を固定幅にパディング（全角3文字 = "月曜日"）
  const paddedDay = day.day.padEnd(4, "　");

  return `${paddedDay}${icon}  ${remainText}${noteText}`;
}

// ────────────────────────────────────────────────────────────────
// ヘルパー関数
// ────────────────────────────────────────────────────────────────

function statusIcon(status: VacancyStatus): string {
  switch (status) {
    case "◯": return "◯";
    case "△": return "△";
    case "×": return "×";
  }
}

function formatRemaining(status: VacancyStatus, remaining: number): string {
  if (status === "×") return "満員";
  if (remaining <= 0) return "残りわずか";
  return `残り${remaining}名`;
}

/**
 * ISO 8601 の日時文字列を "YYYY/MM/DD HH:mm" 形式に変換します。
 */
function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  } catch {
    return isoString;
  }
}

// ────────────────────────────────────────────────────────────────
// エラーメッセージ
// ────────────────────────────────────────────────────────────────

/**
 * データ取得失敗時のフォールバックメッセージ
 */
export function formatErrorMessage(): string {
  return [
    "申し訳ございません🙇",
    "現在、空き状況を取得できませんでした。",
    "",
    "お急ぎの場合は、直接お電話またはメッセージにてお問い合わせください。",
  ].join("\n");
}
