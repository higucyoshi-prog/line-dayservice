/**
 * 共通型定義
 * デイサービス LINE 公式アカウント運用支援ツール
 */

// ────────────────────────────────────────────────────────────────
// 空き状況
// ────────────────────────────────────────────────────────────────

/** 空き状況ステータス */
export type VacancyStatus = "◯" | "△" | "×";

/** 曜日ごとの空き情報 */
export interface DayVacancy {
  /** 曜日（例: "月曜日"） */
  day: string;
  /** 空き状況 */
  status: VacancyStatus;
  /** 残り受入可能人数 */
  remaining: number;
  /** 備考（任意） */
  note?: string;
}

/** スプレッドシートから取得した空き状況データ全体 */
export interface VacancyData {
  /** 全曜日の空き情報 */
  days: DayVacancy[];
  /** データ最終更新日時（ISO 8601） */
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────────
// LINE イベント
// ────────────────────────────────────────────────────────────────

/** Postback データのアクション種別 */
export type PostbackAction = "vacancy" | "schedule" | "contact";

/** Postback データ */
export interface PostbackData {
  action: PostbackAction;
}

// ────────────────────────────────────────────────────────────────
// API レスポンス
// ────────────────────────────────────────────────────────────────

/** /api/refresh エンドポイントのレスポンス */
export interface RefreshResponse {
  success: boolean;
  message: string;
  updatedAt?: string;
}
