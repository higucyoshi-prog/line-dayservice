import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token) return res.status(500).json({ error: "No token" });

  const log: string[] = [];

  try {
    // Step1: Delete existing menus
    const listRes = await fetch("https://api.line.me/v2/bot/richmenu/list", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json() as { richmenus?: { richMenuId: string }[] };
    for (const m of listData.richmenus ?? []) {
      await fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      log.push(`Deleted: ${m.richMenuId}`);
    }

    // Step2: Create menu
    const menuDef = {
      size: { width: 1200, height: 810 },
      selected: true,
      name: "デイサービスおひさま メインメニュー",
      chatBarText: "メニュー",
      areas: [
        { bounds: { x: 0,   y: 0,   width: 400, height: 405 }, action: { type: "postback", label: "空き状況", data: "action=vacancy", displayText: "空き状況を確認" } },
        { bounds: { x: 400, y: 0,   width: 400, height: 405 }, action: { type: "uri", label: "予定表", uri: "https://line-dayservice.vercel.app/yotei.html" } },
        { bounds: { x: 800, y: 0,   width: 400, height: 405 }, action: { type: "uri", label: "施設紹介", uri: "https://nishimikawa-kaigo.jp/" } },
        { bounds: { x: 0,   y: 405, width: 400, height: 405 }, action: { type: "uri", label: "お問い合わせ", uri: "https://line-dayservice.vercel.app/contact.html" } },
        { bounds: { x: 400, y: 405, width: 400, height: 405 }, action: { type: "uri", label: "アクセス", uri: "https://maps.google.com/?q=愛知県刈谷市御幸町3-78" } },
        { bounds: { x: 800, y: 405, width: 400, height: 405 }, action: { type: "uri", label: "採用情報", uri: "https://nishimikawa-kaigo.jp/recruit" } },
      ],
    };

    const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(menuDef),
    });
    const created = await createRes.json() as { richMenuId?: string; message?: string };
    if (!created.richMenuId) {
      return res.status(500).json({ error: "Create failed", detail: created });
    }
    const id = created.richMenuId;
    log.push(`Created: ${id}`);

    // Step3: Set default
    const setRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    log.push(`SetDefault: ${setRes.status}`);

    return res.status(200).json({ success: true, richMenuId: id, log });
  } catch (e: unknown) {
    return res.status(500).json({ error: String(e), log });
  }
}
