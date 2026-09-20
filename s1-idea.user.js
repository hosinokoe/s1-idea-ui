// ==UserScript==
// @name         Stage1st · JetBrains / Darcula 外观
// @namespace    https://stage1st.com/
// @version      0.3.0
// @description  给 Stage1st（Discuz! X3.5）套一层 JetBrains / Darcula 外观：列表页伪装 Git Log、帖子页做成编辑器标签页，但正文保持易读（不代码化），帖子图片内联直显、无需悬浮。灵感来自 czm15053/linuxdo-idea-ui。
// @author       hosinokoe
// @homepageURL  https://github.com/hosinokoe/s1-idea-ui
// @match        *://stage1st.com/*
// @match        *://*.stage1st.com/*
// @match        *://bbs.saraba1st.com/*
// @match        *://*.saraba1st.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "s1-idea-theme";
  const THEME_CLASS = "s1-idea-theme";
  const DARK_CLASS = "s1-idea-dark";
  const FORUM_CLASS = "s1-idea-forum";   // 版块 / 帖子列表页
  const THREAD_CLASS = "s1-idea-thread"; // 帖子内容页
  const DARK_KEY = "s1-idea-dark";

  const REPO_URL = "https://github.com/hosinokoe/s1-idea-ui";
  const BOARD_URL = "https://stage1st.com/2b/";

  // ---------------------------------------------------------------------------
  // Pure helpers (kept side-effect free so the self-check can exercise them).
  // ---------------------------------------------------------------------------

  // Discuz! 页面类型仅由 URL 决定，稳定且无需读 DOM。
  //   forum.php / forum-4-1.html / forumdisplay  -> "forum"
  //   thread-123-1-1.html / mod=viewthread        -> "thread"
  //   其它                                          -> "other"
  function detectPageType(pathname, search) {
    const p = String(pathname || "");
    const q = String(search || "");
    if (/thread-\d+-\d+-\d+\.html/.test(p) || /mod=viewthread/.test(q)) {
      return "thread";
    }
    if (
      /forum-\d+-\d+\.html/.test(p) ||
      /\/forum\.php$/.test(p) ||
      /mod=forumdisplay/.test(q)
    ) {
      return "forum";
    }
    // forum.php 首页（无 query 或带 gid）也算 forum 列表页。
    if (/\/forum\.php/.test(p)) return "forum";
    return "other";
  }

  // 稳定地把任意字符串映射到 [0, n) 的整数，用于给 git-graph 分配颜色/泳道。
  function hashInt(str, n) {
    let seed = 5381;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) seed = ((seed * 33) ^ s.charCodeAt(i)) >>> 0;
    return n > 0 ? seed % n : seed;
  }

  // 把帖子标题清洗成一个像样的 "文件名"（去掉非法字符，限长）。
  function sanitizeFileStem(title) {
    const cleaned = String(title || "untitled")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return cleaned || "untitled";
  }

  // Discuz! 帖子图片常被懒加载：真实 URL 藏在 file / zoomfile / data-original
  // 属性里，src 是占位图，要悬浮或滚动才换真图。给定一个 <img> 的属性字典，
  // 返回应该写入 src 的真实 URL（拿不到就返回 null，表示不用改）。
  // ponytail: 纯函数只做 URL 选择，DOM 读写在 revealImages 里。
  function pickRealImageSrc(attrs) {
    const a = attrs || {};
    const candidates = [a.zoomfile, a.file, a["data-original"], a.src];
    for (const c of candidates) {
      const v = typeof c === "string" ? c.trim() : "";
      if (!v) continue;
      if (/^data:image\/(gif|png);base64/i.test(v)) continue;
      if (/static\/image\/common\/(none|nophoto|zoom)/i.test(v)) continue;
      return v === a.src ? null : v; // 已经是真 src 就不用改
    }
    return null;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------------
  // Self-check: 在非浏览器环境（node）下运行纯函数断言，浏览器里静默跳过。
  // ponytail: 单文件自检，无框架无 fixture。
  // ---------------------------------------------------------------------------
  function selfCheck() {
    const assert = (cond, msg) => {
      if (!cond) throw new Error("selfCheck failed: " + msg);
    };
    assert(detectPageType("/2b/forum-4-1.html", "") === "forum", "forum-N-N");
    assert(detectPageType("/2b/forum.php", "?gid=1") === "forum", "forum.php gid");
    assert(detectPageType("/2b/forum.php", "") === "forum", "forum.php bare");
    assert(
      detectPageType("/2b/forum.php", "?mod=forumdisplay&fid=4") === "forum",
      "forumdisplay"
    );
    assert(detectPageType("/2b/thread-2290108-1-1.html", "") === "thread", "thread-N");
    assert(
      detectPageType("/2b/forum.php", "?mod=viewthread&tid=1") === "thread",
      "viewthread"
    );
    assert(detectPageType("/2b/member.php", "?mod=logging") === "other", "member");
    assert(hashInt("abc", 6) === hashInt("abc", 6), "hash stable");
    assert(hashInt("abc", 6) >= 0 && hashInt("abc", 6) < 6, "hash range");
    assert(hashInt("2290108", 1e6) !== hashInt("2290109", 1e6), "hash distinct");
    assert(sanitizeFileStem("Hello / World?") === "Hello_World", "sanitize");
    assert(sanitizeFileStem("   ") === "untitled", "sanitize empty");
    assert(
      pickRealImageSrc({ src: "x.gif", zoomfile: "real.jpg" }) === "real.jpg",
      "prefer zoomfile"
    );
    assert(
      pickRealImageSrc({ src: "x.gif", file: "real.png" }) === "real.png",
      "fall back to file"
    );
    assert(pickRealImageSrc({ src: "real.jpg" }) === null, "already real src -> null");
    assert(
      pickRealImageSrc({
        src: "static/image/common/none.gif",
        file: "real.jpg",
      }) === "real.jpg",
      "skip placeholder src, use file"
    );
    assert(escapeHtml('<a href="x">&') === "&lt;a href=&quot;x&quot;&gt;&amp;", "escape");
    return true;
  }

  // node 自检入口（浏览器里 module 未定义，直接跳过）。
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      detectPageType,
      hashInt,
      sanitizeFileStem,
      pickRealImageSrc,
      escapeHtml,
      selfCheck,
    };
    if (require.main === module) {
      selfCheck();
      // eslint-disable-next-line no-console
      console.log("s1-idea self-check passed");
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Styles — JetBrains Darcula / IntelliJ Light 双主题。
  // 保留 IDE 外观（Git Log 侧栏 / 编辑器标签页），但正文用比例字体、保持易读。
  // ---------------------------------------------------------------------------
  const RAW_CSS = String.raw`
.${THEME_CLASS} {
  --idea-accent: #4A9FD8;
  --idea-accent-strong: #3592C4;
  --idea-accent-soft: #6CB2D9;
  --idea-editor: #FFFFFF;
  --idea-panel: #F2F2F2;
  --idea-panel-2: #E8E8E8;
  --idea-line: #C9C9C9;
  --idea-line-soft: #E5E5E5;
  --idea-line-strong: #A0A0A0;
  --idea-text: #1D1D1D;
  --idea-text-2: #333333;
  --idea-text-3: #777777;
  --idea-row-hover: #E5F3FF;
  --idea-gutter-text: #999999;
  --idea-code-bg: #F5F5F5;
  color-scheme: light;
}
.${THEME_CLASS}.${DARK_CLASS} {
  --idea-accent: #4A9FD8;
  --idea-accent-strong: #6CB2D9;
  --idea-accent-soft: #3D7A99;
  --idea-editor: #2B2B2B;
  --idea-panel: #3C3F41;
  --idea-panel-2: #313335;
  --idea-line: #555555;
  --idea-line-soft: #3A3A3A;
  --idea-line-strong: #282828;
  --idea-text: #D6D6D6;
  --idea-text-2: #A9B7C6;
  --idea-text-3: #808080;
  --idea-row-hover: #2D4A6F;
  --idea-gutter-text: #606366;
  --idea-code-bg: #313335;
  color-scheme: dark;
}

/* Base surfaces — 正文用比例字体，保持阅读体验 */
.${THEME_CLASS},
.${THEME_CLASS} body {
  background: var(--idea-editor) !important;
  color: var(--idea-text) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif !important;
}
.${THEME_CLASS} a { color: var(--idea-accent-strong) !important; }
.${THEME_CLASS} a:hover { color: var(--idea-accent) !important; }

/* Discuz! 大量硬编码白底/边框，统一覆盖 */
.${THEME_CLASS} .wp,
.${THEME_CLASS} #ct,
.${THEME_CLASS} .mn,
.${THEME_CLASS} #ct .mn,
.${THEME_CLASS} .bm_c,
.${THEME_CLASS} .comiis_top,
.${THEME_CLASS} .tb .a,
.${THEME_CLASS} .pg a,
.${THEME_CLASS} .pgb a {
  background: transparent !important;
}
.${THEME_CLASS} .bm {
  border: 1px solid var(--idea-line) !important;
  border-radius: 4px !important;
  box-shadow: none !important;
  background: var(--idea-panel) !important;
  margin-bottom: 10px !important;
}
.${THEME_CLASS} .bm_h,
.${THEME_CLASS} .bm_h.cl {
  background: var(--idea-panel-2) !important;
  border-bottom: 1px solid var(--idea-line) !important;
  color: var(--idea-text) !important;
}
.${THEME_CLASS} .bm_c { background: var(--idea-editor) !important; }

/* ---- IDE 顶栏（菜单条） ---- */
.${THEME_CLASS} #toptb,
.${THEME_CLASS} #toptb .wp {
  background: var(--idea-panel) !important;
  border-bottom: 1px solid var(--idea-line-strong) !important;
  color: var(--idea-text-2) !important;
}
.${THEME_CLASS} #hd {
  background: var(--idea-panel) !important;
  border-bottom: 1px solid var(--idea-line) !important;
}
.${THEME_CLASS} #nv,
.${THEME_CLASS} #nv a {
  background: transparent !important;
  color: var(--idea-text-2) !important;
}
.${THEME_CLASS} .s1-idea-menubar {
  display: flex;
  align-items: center;
  gap: 1px;
  height: 28px;
  padding: 0 8px;
  background: var(--idea-panel);
  border-bottom: 1px solid var(--idea-line);
  font-size: 12px;
  user-select: none;
}
.${THEME_CLASS} .s1-idea-menubar span {
  padding: 3px 8px;
  border-radius: 2px;
  color: var(--idea-text-2);
  cursor: default;
  white-space: nowrap;
}
.${THEME_CLASS} .s1-idea-menubar span:hover {
  background: var(--idea-row-hover);
  color: var(--idea-text);
}
/* 品牌区：两个可点主页链接（仓库 + S1 版块） */
.${THEME_CLASS} .s1-idea-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
}
.${THEME_CLASS} .s1-idea-brand svg { width: 16px; height: 16px; flex: 0 0 auto; }
.${THEME_CLASS} .s1-idea-brand a {
  padding: 3px 6px;
  border-radius: 2px;
  font-weight: 600;
  color: var(--idea-text) !important;
  text-decoration: none;
  cursor: pointer;
}
.${THEME_CLASS} .s1-idea-brand a:hover {
  background: var(--idea-row-hover);
  color: var(--idea-accent-strong) !important;
}
.${THEME_CLASS} .s1-idea-brand .s1-idea-brand-sep {
  color: var(--idea-text-3);
  font-weight: 400;
}
.${THEME_CLASS} .s1-idea-menubar .s1-idea-spacer { flex: 1 1 auto; }
.${THEME_CLASS} .s1-idea-theme-toggle {
  cursor: pointer;
  padding: 3px 10px !important;
  border: 1px solid var(--idea-line) !important;
  border-radius: 2px;
  background: var(--idea-panel-2) !important;
}
.${THEME_CLASS} .s1-idea-theme-toggle:hover {
  border-color: var(--idea-accent-soft) !important;
  color: var(--idea-accent-strong) !important;
}

/* ---- 版块索引 / 帖子列表 (forumdisplay) —— 配色 + Git Log 侧栏，标题保持比例字体 ---- */
.${FORUM_CLASS} #threadlisttableid,
.${FORUM_CLASS} .tl table {
  background: var(--idea-editor) !important;
}
.${FORUM_CLASS} .tl th,
.${FORUM_CLASS} .tl td {
  border-color: var(--idea-line-soft) !important;
  color: var(--idea-text-2) !important;
}
.${FORUM_CLASS} .tl .th,
.${FORUM_CLASS} .tl .fl_row,
.${FORUM_CLASS} .th {
  background: var(--idea-panel) !important;
  border-bottom: 1px solid var(--idea-line) !important;
  color: var(--idea-text-3) !important;
}
.${FORUM_CLASS} tbody[id^="normalthread_"],
.${FORUM_CLASS} tbody[id^="stickthread_"] {
  background: var(--idea-editor) !important;
}
.${FORUM_CLASS} tbody[id^="normalthread_"]:hover,
.${FORUM_CLASS} tbody[id^="stickthread_"]:hover {
  background: var(--idea-row-hover) !important;
}
.${FORUM_CLASS} .tl th a.xst,
.${FORUM_CLASS} .tl th a.s.xst {
  color: var(--idea-text) !important;
  font-weight: 400 !important;
}
.${FORUM_CLASS} .tl th a.xst:hover { color: var(--idea-accent-strong) !important; }
/* 数字列（回复/查看）等宽对齐 */
.${FORUM_CLASS} .tl td.by,
.${FORUM_CLASS} .tl td.num,
.${FORUM_CLASS} .tl td.by a,
.${FORUM_CLASS} .tl td.num a {
  color: var(--idea-text-3) !important;
  font-variant-numeric: tabular-nums;
}

/* git-graph 装饰：插在标题前的小 SVG（Git Log 味道），不影响文字字体 */
.${FORUM_CLASS} .s1-idea-git {
  display: inline-flex;
  vertical-align: middle;
  width: 34px;
  height: 20px;
  margin-right: 6px;
  flex: 0 0 auto;
  pointer-events: none;
}
.${FORUM_CLASS} .s1-idea-git svg { width: 34px; height: 20px; display: block; }

/* 版块索引块里的分区标题 */
.${FORUM_CLASS} .fl_g,
.${FORUM_CLASS} .fl_row td { background: var(--idea-editor) !important; }
.${FORUM_CLASS} .fl_g:hover { background: var(--idea-row-hover) !important; }

/* ---- 帖子页：编辑器标签页 + 配色，正文保持易读 ---- */
.${THREAD_CLASS} .s1-idea-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 14px;
  background: var(--idea-panel-2);
  border-bottom: 1px solid var(--idea-line-strong);
  color: var(--idea-text);
  font-size: 12px;
  font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
}
.${THREAD_CLASS} .s1-idea-tab .s1-idea-tab-dot {
  width: 12px; height: 12px; border-radius: 2px;
  background: linear-gradient(135deg, #CC7832, #6A8759);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 25%);
  flex: 0 0 auto;
}
.${THREAD_CLASS} #postlist { background: var(--idea-editor) !important; }
.${THREAD_CLASS} #postlist > div[id^="post_"] {
  border-bottom: 1px solid var(--idea-line-soft) !important;
  background: var(--idea-editor) !important;
}
.${THREAD_CLASS} .plhin,
.${THREAD_CLASS} .pls,
.${THREAD_CLASS} .plc,
.${THREAD_CLASS} .pct,
.${THREAD_CLASS} .pcb,
.${THREAD_CLASS} table.plhin {
  background: var(--idea-editor) !important;
  border-color: var(--idea-line-soft) !important;
  color: var(--idea-text-2) !important;
}
.${THREAD_CLASS} .pls,
.${THREAD_CLASS} .pls .favatar { border-color: var(--idea-line-soft) !important; }
.${THREAD_CLASS} .authi a,
.${THREAD_CLASS} .authi .xw1,
.${THREAD_CLASS} .xw1 { color: var(--idea-accent-strong) !important; }
/* 楼层号做成 IDE 行号/方法名的高亮色 */
.${THREAD_CLASS} .plc .pi strong a { color: var(--idea-accent) !important; }
/* 正文：比例字体、舒适行距，绝不 monospace */
.${THREAD_CLASS} .pct .t_f,
.${THREAD_CLASS} td.t_f {
  padding: 12px 16px !important;
  color: var(--idea-text) !important;
  font-size: 15px !important;
  line-height: 1.75 !important;
  background: var(--idea-editor) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif !important;
}
/* 帖子图片：内联直显、响应式，不再靠悬浮 */
.${THREAD_CLASS} .t_f img,
.${THREAD_CLASS} .pcb img {
  max-width: 100% !important;
  height: auto !important;
  cursor: zoom-in;
}
/* 真正的代码块 / 引用才用等宽字体 */
.${THREAD_CLASS} .blockcode,
.${THREAD_CLASS} .blockcode ol,
.${THREAD_CLASS} .blockcode li,
.${THREAD_CLASS} pre,
.${THREAD_CLASS} code {
  background: var(--idea-code-bg) !important;
  border: 1px solid var(--idea-line) !important;
  border-radius: 3px !important;
  color: var(--idea-text-2) !important;
  font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace !important;
}
.${THREAD_CLASS} .quote blockquote {
  background: var(--idea-code-bg) !important;
  border-left: 3px solid var(--idea-accent-soft) !important;
  border-radius: 0 3px 3px 0 !important;
  color: var(--idea-text-2) !important;
  padding: 8px 12px !important;
}

/* ---- 状态栏 ---- */
.${THEME_CLASS} .s1-idea-statusbar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 900;
  height: 22px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--idea-panel);
  border-top: 1px solid var(--idea-line);
  color: var(--idea-text-3);
  font-size: 11px;
  font-family: "JetBrains Mono", Menlo, Consolas, monospace;
  pointer-events: none;
}
.${THEME_CLASS} #ft { padding-bottom: 30px !important; }
.${THEME_CLASS} #ft,
.${THEME_CLASS} #flk { background: transparent !important; color: var(--idea-text-3) !important; }
`;

  // 品牌 mark（简化版 IDEA 方形）。
  const BRAND_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<rect x="0" y="0" width="16" height="16" rx="3" fill="#000"/>' +
    '<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="#4A9FD8" stroke-width="1.4"/>' +
    '<rect x="3.5" y="10.5" width="5" height="1.4" fill="#4A9FD8"/>' +
    "</svg>";

  const MENU_ITEMS = [
    "File", "Edit", "View", "Navigate", "Code", "Refactor",
    "Run", "Tools", "VCS", "Window", "Help"
  ];

  const GIT_COLORS = ["#4A9FD8", "#499C54", "#C1862E", "#954F72", "#39A7AC", "#D05A4E"];

  // ---------------------------------------------------------------------------
  // DOM side effects
  // ---------------------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById(STYLE_ID) || !document.documentElement) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = RAW_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function isDark() {
    try {
      const v = localStorage.getItem(DARK_KEY);
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (e) { /* ignore */ }
    return true; // 默认 Darcula
  }
  function setDark(on) {
    try { localStorage.setItem(DARK_KEY, on ? "1" : "0"); } catch (e) { /* ignore */ }
    document.documentElement.classList.toggle(DARK_CLASS, on);
    const btn = document.querySelector(".s1-idea-theme-toggle");
    if (btn) btn.textContent = on ? "Darcula" : "IntelliJ Light";
  }

  function makeMenuBar() {
    if (!document.body || document.getElementById("s1-idea-menubar")) return;
    const bar = document.createElement("div");
    bar.id = "s1-idea-menubar";
    bar.className = "s1-idea-menubar";

    // 品牌区：两个可点主页链接 —— 仓库 + S1 版块。
    const brand = document.createElement("span");
    brand.className = "s1-idea-brand";
    const repo = document.createElement("a");
    repo.href = REPO_URL;
    repo.target = "_blank";
    repo.rel = "noopener noreferrer";
    repo.innerHTML = BRAND_SVG + "s1-idea-ui";
    repo.title = "GitHub 仓库：hosinokoe/s1-idea-ui";
    const sep = document.createElement("span");
    sep.className = "s1-idea-brand-sep";
    sep.textContent = "·";
    const board = document.createElement("a");
    board.href = BOARD_URL;
    board.textContent = "Stage1st";
    board.title = "Stage1st · 2b 版块";
    brand.appendChild(repo);
    brand.appendChild(sep);
    brand.appendChild(board);
    bar.appendChild(brand);

    for (const name of MENU_ITEMS) {
      const item = document.createElement("span");
      item.textContent = name;
      bar.appendChild(item);
    }

    const spacer = document.createElement("span");
    spacer.className = "s1-idea-spacer";
    bar.appendChild(spacer);

    const toggle = document.createElement("span");
    toggle.className = "s1-idea-theme-toggle";
    toggle.textContent = isDark() ? "Darcula" : "IntelliJ Light";
    toggle.addEventListener("click", () =>
      setDark(!document.documentElement.classList.contains(DARK_CLASS))
    );
    bar.appendChild(toggle);

    document.body.insertBefore(bar, document.body.firstChild);
  }

  function makeStatusBar() {
    if (!document.body || document.getElementById("s1-idea-statusbar")) return;
    const bar = document.createElement("div");
    bar.id = "s1-idea-statusbar";
    bar.className = "s1-idea-statusbar";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML =
      "<span>UTF-8</span><span>LF</span>" +
      "<span>Discuz! X3.5</span><span>Darcula · Stage1st</span>";
    document.body.appendChild(bar);
  }

  // 版块列表：给每个主题行标题前加一条 git-graph 装饰线（Git Log 味道）。
  // ponytail: 装饰性伪 git 图，泳道由 tid 哈希决定，不追求真实提交拓扑。
  function buildGitSvg(seed) {
    const lane = seed % 3;             // 0..2
    const x = 6 + lane * 10;
    const color = GIT_COLORS[seed % GIT_COLORS.length];
    const branch = (seed >> 2) % 4 === 0; // 偶尔画一条分叉
    let parts =
      `<line x1="${x}" y1="0" x2="${x}" y2="20" stroke="${color}" stroke-width="1.4"/>`;
    if (branch && lane < 2) {
      const x2 = x + 10;
      const c2 = GIT_COLORS[(seed + 1) % GIT_COLORS.length];
      parts +=
        `<path d="M${x} 10 C ${(x + x2) / 2} 10, ${(x + x2) / 2} 4, ${x2} 4" ` +
        `fill="none" stroke="${c2}" stroke-width="1.4"/>`;
    }
    parts +=
      `<circle cx="${x}" cy="10" r="3.2" fill="${color}" ` +
      `stroke="var(--idea-editor)" stroke-width="1.2"/>`;
    return `<svg viewBox="0 0 34 20">${parts}</svg>`;
  }

  function decorateThreadList() {
    const rows = document.querySelectorAll(
      'tbody[id^="normalthread_"], tbody[id^="stickthread_"]'
    );
    for (const tbody of rows) {
      const titleCell = tbody.querySelector("th.new, th.common, th");
      if (!titleCell) continue;
      const anchor = titleCell.querySelector("a.xst");
      if (!anchor || titleCell.querySelector(".s1-idea-git")) continue;
      const tid = (tbody.id.match(/(\d+)/) || [])[1] || anchor.textContent || "";
      const seed = hashInt(tid, 1e6);
      const holder = document.createElement("span");
      holder.className = "s1-idea-git";
      holder.setAttribute("aria-hidden", "true");
      holder.innerHTML = buildGitSvg(seed);
      titleCell.insertBefore(holder, titleCell.firstChild);
    }
  }

  // 帖子页：加一个编辑器标签页（文件名 = 帖子标题.md，正文仍是比例字体）。
  function decorateThread() {
    const postlist = document.getElementById("postlist");
    if (!postlist || document.getElementById("s1-idea-tab")) return;
    const rawTitle =
      document.querySelector("#thread_subject")?.textContent?.trim() ||
      document.title.replace(/\s*-\s*Stage1st.*$/i, "").trim() ||
      "untitled";
    const fileName = sanitizeFileStem(rawTitle) + ".md";
    const tab = document.createElement("div");
    tab.id = "s1-idea-tab";
    tab.className = "s1-idea-tab";
    tab.setAttribute("aria-hidden", "true");
    tab.innerHTML =
      '<span class="s1-idea-tab-dot"></span>' +
      "<span>" + escapeHtml(fileName) + "</span>";
    postlist.parentNode.insertBefore(tab, postlist);
  }

  // 帖子页：把 Discuz! 懒加载图片的真实 URL 写回 src，让图片直接内联显示，
  // 不再依赖悬浮/滚动。用 pickRealImageSrc 决定 URL，纯 DOM 副作用在这里。
  function revealImages(root) {
    const scope = root || document;
    const imgs = scope.querySelectorAll(
      ".t_f img, .pcb img, img[file], img[zoomfile], img[data-original]"
    );
    for (const img of imgs) {
      if (img.dataset.s1Revealed === "1") continue;
      const real = pickRealImageSrc({
        src: img.getAttribute("src") || "",
        file: img.getAttribute("file") || "",
        zoomfile: img.getAttribute("zoomfile") || "",
        "data-original": img.getAttribute("data-original") || "",
      });
      if (real) {
        img.src = real;
        img.removeAttribute("onmouseover");
        img.removeAttribute("onclick");
        img.removeAttribute("lazyloadthumb");
      }
      img.loading = "eager";
      if (img.style && img.style.display === "none") img.style.display = "";
      img.dataset.s1Revealed = "1";
    }
  }

  function apply() {
    injectStyle();
    const root = document.documentElement;
    root.classList.add(THEME_CLASS);
    root.classList.toggle(DARK_CLASS, isDark());
    if (!document.body) return;

    const type = detectPageType(location.pathname, location.search);
    root.classList.toggle(FORUM_CLASS, type === "forum");
    root.classList.toggle(THREAD_CLASS, type === "thread");
    document.body.classList.toggle(FORUM_CLASS, type === "forum");
    document.body.classList.toggle(THREAD_CLASS, type === "thread");

    makeMenuBar();
    makeStatusBar();

    if (type === "forum") decorateThreadList();
    if (type === "thread") { decorateThread(); revealImages(document); }
  }

  // Discuz! 是整页刷新（非 SPA），一次 DOMContentLoaded 基本够用；
  // 但异步加载（如楼层展开、图片懒加载替换）会改内容，故轻量观察一次 body。
  function bootstrap() {
    if (!document.documentElement) { setTimeout(bootstrap, 0); return; }
    injectStyle();
    document.documentElement.classList.add(THEME_CLASS);
    document.documentElement.classList.toggle(DARK_CLASS, isDark());

    const run = () => apply();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
    // 内容异步更新时补一次装饰/图片揭示（节流）。
    let scheduled = false;
    const obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const type = detectPageType(location.pathname, location.search);
        if (type === "forum") decorateThreadList();
        if (type === "thread") { decorateThread(); revealImages(document); }
      });
    });
    const startObs = () => {
      if (document.body) obs.observe(document.body, { childList: true, subtree: true });
      else setTimeout(startObs, 50);
    };
    startObs();
  }

  bootstrap();
})();
