import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!token) return res.status(500).json({ error: "No token" });
  const log: string[] = [];
  try {
    const h = { Authorization: `Bearer ${token}` };
    const listRes = await fetch("https://api.line.me/v2/bot/richmenu/list", { headers: h });
    const listData = await listRes.json() as { richmenus?: { richMenuId: string }[] };
    for (const m of listData.richmenus ?? []) {
      await fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: "DELETE", headers: h });
      log.push("Deleted: " + m.richMenuId);
    }
    const menuDef = { size: { width: 1200, height: 810 }, selected: true, name: "ohisama-menu", chatBarText: "menu", areas: [
      { bounds: { x:0,   y:0,   width:400, height:405 }, action: { type:"postback", label:"vacancy", data:"action=vacancy", displayText:"vacancy" } },
      { bounds: { x:400, y:0,   width:400, height:405 }, action: { type:"uri", label:"schedule", uri:"https://docs.google.com/spreadsheets/d/1GFSLIU0E34Dt9Z_JNaQdi1EzjMnRygvpEwlxurndKd0" } },
      { bounds: { x:800, y:0,   width:400, height:405 }, action: { type:"uri", label:"about", uri:"https://example.com" } },
      { bounds: { x:0,   y:405, width:400, height:405 }, action: { type:"uri", label:"contact", uri:"https://line.me/ti/p/@ohisama" } },
      { bounds: { x:400, y:405, width:400, height:405 }, action: { type:"uri", label:"access", uri:"https://maps.google.com" } },
      { bounds: { x:800, y:405, width:400, height:405 }, action: { type:"uri", label:"recruit", uri:"https://example.com/recruit" } },
    ]};
    const createRes = await fetch("https://api.line.me/v2/bot/richmenu", { method:"POST", headers:{...h,"Content-Type":"application/json"}, body: JSON.stringify(menuDef) });
    const created = await createRes.json() as { richMenuId?: string };
    if (!created.richMenuId) return res.status(500).json({ error: "Create failed", detail: created });
    log.push("Created: " + created.richMenuId);
    const setRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${created.richMenuId}`, { method:"POST", headers: h });
    log.push("Default: " + setRes.status);
    return res.status(200).json({ ok: true, richMenuId: created.richMenuId, log });
  } catch(e) { return res.status(500).json({ error: String(e), log }); }
}
