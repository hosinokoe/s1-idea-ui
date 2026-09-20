// ==UserScript==
// @name         Stage1st · JetBrains / Darcula 外观
// @namespace    https://stage1st.com/
// @version      0.4.0
// @description  把 Stage1st（Discuz! X3.5）换成 JetBrains IDE / Darcula 风格：列表页伪装 Git Log，帖子正文渲染成代码编辑器（行号 gutter + 假 Java 类/方法 + 语法色 + 折叠图片）。灵感与实现思路来自 czm15053/linuxdo-idea-ui。
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
  const FORUM_CLASS = "s1-idea-forum";
  const THREAD_CLASS = "s1-idea-thread";
  const DARK_KEY = "s1-idea-dark";

  const REPO_URL = "https://github.com/hosinokoe/s1-idea-ui";
  const BOARD_URL = "https://stage1st.com/2b/";

  // ---------------------------------------------------------------------------
  // Pure helpers (side-effect free, exercised by the node self-check).
  // ---------------------------------------------------------------------------

  function detectPageType(pathname, search) {
    const p = String(pathname || "");
    const q = String(search || "");
    if (/thread-\d+-\d+-\d+\.html/.test(p) || /mod=viewthread/.test(q)) return "thread";
    if (
      /forum-\d+-\d+\.html/.test(p) ||
      /\/forum\.php$/.test(p) ||
      /mod=forumdisplay/.test(q)
    ) {
      return "forum";
    }
    if (/\/forum\.php/.test(p)) return "forum";
    return "other";
  }

  function hashInt(str, n) {
    let seed = 5381;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) seed = ((seed * 33) ^ s.charCodeAt(i)) >>> 0;
    return n > 0 ? seed % n : seed;
  }

  function sanitizeFileStem(title) {
    const cleaned = String(title || "untitled")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return cleaned || "untitled";
  }

  // 把名字清洗成合法的 Java 标识符片段（用于方法名 reply_xxx_N）。
  function sanitizeIdent(name) {
    const s = String(name || "user").replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
    return s || "user";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Discuz! 懒加载图片：真实 URL 藏在 file / zoomfile / data-original，src 是占位。
  function pickRealImageSrc(attrs) {
    const a = attrs || {};
    const candidates = [a.zoomfile, a.file, a["data-original"], a.src];
    for (const c of candidates) {
      const v = typeof c === "string" ? c.trim() : "";
      if (!v) continue;
      if (/^data:image\/(gif|png);base64/i.test(v)) continue;
      if (/static\/image\/common\/(none|nophoto|zoom)/i.test(v)) continue;
      return v === a.src ? null : v;
    }
    return null;
  }

  // 按字符宽度折行（CJK 友好，按 code point 计数），参考 wrapPlainText。
  function wrapPlainText(text, width = 72) {
    const input = String(text || "").replace(/\s+/g, " ").trim();
    if (!input) return [""];
    const chars = Array.from(input);
    const rows = [];
    for (let i = 0; i < chars.length; i += width) rows.push(chars.slice(i, i + width).join(""));
    return rows;
  }

  // 把一行纯文本包成带语法色的「注释行」HTML：prefix 为注释前缀（"// " 等），
  // 已 escape 的正文包在 .s1-cmt 里。参考 pushCommentLines 的着色思路。
  function commentLineHtml(prefix, escapedText) {
    return `<span class="s1-cmt">${escapeHtml(prefix)}${escapedText}</span>`;
  }

  // 语法色分类：给一段假代码文本套 span，简单规则（关键字/字符串/注释）。
  // 参考 idea-kw/idea-str/idea-cmt/idea-fn 的着色，规则从简。
  // ponytail: 正则着色是启发式，非真正解析器；字符串正则不处理内含转义实体
  //   （如内容含 & 的字符串会漏色）。升级路径：接一个真词法分析器。
  const JAVA_KW = /\b(package|import|public|private|class|void|var|return|new|if|else|for|while|assert|final|static)\b/g;
  function highlightCode(escapedLine) {
    let s = String(escapedLine);
    // 整行注释
    if (/^\s*(\/\/|\*|\/\*\*?|\*\/)/.test(s.replace(/&[a-z]+;/g, ""))) {
      return `<span class="s1-cmt">${s}</span>`;
    }
    // 字符串
    s = s.replace(/&quot;[^&]*?&quot;/g, (m) => `<span class="s1-str">${m}</span>`);
    // 关键字
    s = s.replace(JAVA_KW, (m) => `<span class="s1-kw">${m}</span>`);
    // 方法名 foo(
    s = s.replace(/\b([A-Za-z_]\w*)(\s*\()/g, (m, name, paren) =>
      /^(if|for|while|switch|catch)$/.test(name) ? m : `<span class="s1-fn">${name}</span>${paren}`
    );
    return s;
  }

  // ---------------------------------------------------------------------------
  // Self-check
  // ---------------------------------------------------------------------------
  function selfCheck() {
    const assert = (cond, msg) => {
      if (!cond) throw new Error("selfCheck failed: " + msg);
    };
    assert(detectPageType("/2b/forum-4-1.html", "") === "forum", "forum-N-N");
    assert(detectPageType("/2b/forum.php", "?gid=1") === "forum", "forum.php gid");
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
    assert(sanitizeIdent("张三 A.b") === "A_b", "ident strips non-word + trims");
    assert(sanitizeIdent("reply 2") === "reply_2", "ident space");
    assert(sanitizeIdent("") === "user", "ident empty");
    assert(
      pickRealImageSrc({ src: "x.gif", zoomfile: "real.jpg" }) === "real.jpg",
      "prefer zoomfile"
    );
    assert(pickRealImageSrc({ src: "x.gif", file: "real.png" }) === "real.png", "file");
    assert(pickRealImageSrc({ src: "real.jpg" }) === null, "already real -> null");
    assert(
      pickRealImageSrc({ src: "static/image/common/none.gif", file: "r.jpg" }) === "r.jpg",
      "skip placeholder src"
    );
    // wrapPlainText
    assert(wrapPlainText("") .length === 1 && wrapPlainText("")[0] === "", "wrap empty");
    assert(wrapPlainText("a b  c") .join("|") === "a b c", "wrap collapse ws");
    assert(wrapPlainText("abcdef", 3).join("|") === "abc|def", "wrap width");
    assert(wrapPlainText("你好世界一二三", 3).length === 3, "wrap cjk by codepoint");
    // 语法色 & 注释行
    assert(commentLineHtml("// ", "hi").includes("s1-cmt"), "comment span");
    assert(highlightCode("public class Foo {").includes("s1-kw"), "kw color");
    assert(highlightCode("// hello").includes("s1-cmt"), "line comment color");
    assert(escapeHtml('<a href="x">&') === "&lt;a href=&quot;x&quot;&gt;&amp;", "escape");
    return true;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      detectPageType,
      hashInt,
      sanitizeFileStem,
      sanitizeIdent,
      pickRealImageSrc,
      wrapPlainText,
      commentLineHtml,
      highlightCode,
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
  // Styles
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
  --idea-kw: #0033B3;
  --idea-str: #067D17;
  --idea-cmt: #8C8C8C;
  --idea-fn: #7A5D00;
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
  --idea-kw: #CC7832;
  --idea-str: #6A8759;
  --idea-cmt: #808080;
  --idea-fn: #FFC66D;
  color-scheme: dark;
}

.${THEME_CLASS},
.${THEME_CLASS} body {
  background: var(--idea-editor) !important;
  color: var(--idea-text) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif !important;
}
.${THEME_CLASS} a { color: var(--idea-accent-strong) !important; }
.${THEME_CLASS} a:hover { color: var(--idea-accent) !important; }

.${THEME_CLASS} .wp,
.${THEME_CLASS} #ct,
.${THEME_CLASS} .mn,
.${THEME_CLASS} #ct .mn,
.${THEME_CLASS} .bm_c,
.${THEME_CLASS} .comiis_top,
.${THEME_CLASS} .tb .a,
.${THEME_CLASS} .pg a,
.${THEME_CLASS} .pgb a { background: transparent !important; }
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

/* ---- 顶栏菜单条 ---- */
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
.${THEME_CLASS} #nv a { background: transparent !important; color: var(--idea-text-2) !important; }
/* 右上角个人头像隐藏（顶栏用户区），用户名/菜单保留 */
.${THEME_CLASS} #toptb .avt img,
.${THEME_CLASS} #toptb .avt .avatar,
.${THEME_CLASS} #hd .avt img,
.${THEME_CLASS} #um .avt img,
.${THEME_CLASS} .vwmy .avt img,
.${THEME_CLASS} #myprompt_menu .avt img { display: none !important; }
.${THEME_CLASS} #toptb .avt,
.${THEME_CLASS} #hd .avt { width: 0 !important; margin: 0 !important; padding: 0 !important; }
.${THEME_CLASS} .s1-idea-menubar {
  display: flex; align-items: center; gap: 1px; height: 28px; padding: 0 8px;
  background: var(--idea-panel); border-bottom: 1px solid var(--idea-line);
  font-size: 12px; user-select: none;
}
.${THEME_CLASS} .s1-idea-menubar span {
  padding: 3px 8px; border-radius: 2px; color: var(--idea-text-2);
  cursor: default; white-space: nowrap;
}
.${THEME_CLASS} .s1-idea-menubar span:hover { background: var(--idea-row-hover); color: var(--idea-text); }
.${THEME_CLASS} .s1-idea-brand { display: inline-flex; align-items: center; gap: 6px; margin-right: 8px; }
.${THEME_CLASS} .s1-idea-brand svg { width: 16px; height: 16px; flex: 0 0 auto; }
.${THEME_CLASS} .s1-idea-brand a {
  padding: 3px 6px; border-radius: 2px; font-weight: 600;
  color: var(--idea-text) !important; text-decoration: none; cursor: pointer;
}
.${THEME_CLASS} .s1-idea-brand a:hover { background: var(--idea-row-hover); color: var(--idea-accent-strong) !important; }
.${THEME_CLASS} .s1-idea-brand .s1-idea-brand-sep { color: var(--idea-text-3); font-weight: 400; }
.${THEME_CLASS} .s1-idea-menubar .s1-idea-spacer { flex: 1 1 auto; }
.${THEME_CLASS} .s1-idea-theme-toggle {
  cursor: pointer; padding: 3px 10px !important;
  border: 1px solid var(--idea-line) !important; border-radius: 2px;
  background: var(--idea-panel-2) !important;
}
.${THEME_CLASS} .s1-idea-theme-toggle:hover {
  border-color: var(--idea-accent-soft) !important; color: var(--idea-accent-strong) !important;
}

/* ---- 列表页：Git Log ---- */
.${FORUM_CLASS} #threadlisttableid,
.${FORUM_CLASS} .tl table { background: var(--idea-editor) !important; }
.${FORUM_CLASS} .tl th,
.${FORUM_CLASS} .tl td { border-color: var(--idea-line-soft) !important; color: var(--idea-text-2) !important; }
.${FORUM_CLASS} .tl .th,
.${FORUM_CLASS} .tl .fl_row,
.${FORUM_CLASS} .th {
  background: var(--idea-panel) !important;
  border-bottom: 1px solid var(--idea-line) !important; color: var(--idea-text-3) !important;
}
.${FORUM_CLASS} tbody[id^="normalthread_"],
.${FORUM_CLASS} tbody[id^="stickthread_"] { background: var(--idea-editor) !important; }
.${FORUM_CLASS} tbody[id^="normalthread_"]:hover,
.${FORUM_CLASS} tbody[id^="stickthread_"]:hover { background: var(--idea-row-hover) !important; }
.${FORUM_CLASS} .tl th a.xst,
.${FORUM_CLASS} .tl th a.s.xst { color: var(--idea-text) !important; font-weight: 400 !important; }
.${FORUM_CLASS} .tl th a.xst:hover { color: var(--idea-accent-strong) !important; }
.${FORUM_CLASS} .tl td.by,
.${FORUM_CLASS} .tl td.num,
.${FORUM_CLASS} .tl td.by a,
.${FORUM_CLASS} .tl td.num a { color: var(--idea-text-3) !important; font-variant-numeric: tabular-nums; }
.${FORUM_CLASS} .s1-idea-git {
  display: inline-flex; vertical-align: middle; width: 34px; height: 20px;
  margin-right: 6px; flex: 0 0 auto; pointer-events: none;
}
.${FORUM_CLASS} .s1-idea-git svg { width: 34px; height: 20px; display: block; }
.${FORUM_CLASS} .fl_g,
.${FORUM_CLASS} .fl_row td { background: var(--idea-editor) !important; }
.${FORUM_CLASS} .fl_g:hover { background: var(--idea-row-hover) !important; }

/* ---- 帖子页：编辑器标签页 + 代码框 ---- */
.${THREAD_CLASS} .s1-idea-tab {
  display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 14px;
  background: var(--idea-panel-2); border-bottom: 1px solid var(--idea-line-strong);
  color: var(--idea-text); font-size: 12px;
  font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
}
.${THREAD_CLASS} .s1-idea-tab .s1-idea-tab-dot {
  width: 12px; height: 12px; border-radius: 2px;
  background: linear-gradient(135deg, #CC7832, #6A8759);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 25%); flex: 0 0 auto;
}
.${THREAD_CLASS} #postlist { background: var(--idea-editor) !important; }
.${THREAD_CLASS} #postlist > div[id^="post_"] {
  border-bottom: 1px solid var(--idea-line-soft) !important; background: var(--idea-editor) !important;
}
.${THREAD_CLASS} .plhin,
.${THREAD_CLASS} .pls,
.${THREAD_CLASS} .plc,
.${THREAD_CLASS} .pct,
.${THREAD_CLASS} .pcb,
.${THREAD_CLASS} table.plhin {
  background: var(--idea-editor) !important; border-color: var(--idea-line-soft) !important;
  color: var(--idea-text-2) !important;
}
.${THREAD_CLASS} .authi a,
.${THREAD_CLASS} .authi .xw1,
.${THREAD_CLASS} .xw1 { color: var(--idea-accent-strong) !important; }
.${THREAD_CLASS} .plc .pi strong a { color: var(--idea-accent) !important; }

/* 精简论坛头像/身份侧栏：作者已折进代码框类头，头像与个人资料块冗余（参考原作者隐藏头像） */
.${THREAD_CLASS} .pls .avatar,
.${THREAD_CLASS} .pls .favatar .avatar,
.${THREAD_CLASS} .pls .p_pop,
.${THREAD_CLASS} .pls .tns,
.${THREAD_CLASS} .pls .pnpost,
.${THREAD_CLASS} .pls .xg1,
.${THREAD_CLASS} .pls dl.bbda,
.${THREAD_CLASS} .pls .md_ctrl { display: none !important; }
/* 作者列收窄成一条窄栏，只留用户名，像 IDE 里的作者注记 */
.${THREAD_CLASS} td.pls {
  width: 120px !important; min-width: 0 !important;
  padding: 8px 10px !important; vertical-align: top !important;
}
.${THREAD_CLASS} .pls .authi { margin: 0 !important; padding: 0 !important; }

/* 真正的正文被隐藏，代码框接管 */
.${THREAD_CLASS} .t_f.s1-cooked-hidden { display: none !important; }
.${THREAD_CLASS} .s1-code-frame {
  display: grid; grid-template-columns: 56px minmax(0, 1fr);
  width: 100%; min-height: 24px; background: var(--idea-editor);
  border-top: 1px solid var(--idea-line-soft);
  font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace !important;
}
.${THREAD_CLASS} .s1-gutter {
  grid-column: 1; padding: 10px 8px 18px 0;
  border-right: 1px solid var(--idea-line-soft); background: var(--idea-editor);
  color: var(--idea-gutter-text); font-size: 13px; line-height: 20px;
  text-align: right; user-select: none; white-space: pre; font-variant-numeric: tabular-nums;
}
.${THREAD_CLASS} .s1-code-pane {
  grid-column: 2; min-width: 0; padding: 10px 18px 18px 14px; overflow-x: auto; overflow-y: visible;
}
.${THREAD_CLASS} .s1-code-lines { margin: 0; padding: 0; list-style: none; }
.${THREAD_CLASS} .s1-code-line {
  display: block; min-height: 20px; margin: 0; padding: 0;
  color: var(--idea-text-2); font-size: 13px; line-height: 20px;
  white-space: pre-wrap; word-break: break-word;
}
.${THREAD_CLASS} .s1-code-line .s1-kw { color: var(--idea-kw) !important; }
.${THREAD_CLASS} .s1-code-line .s1-str { color: var(--idea-str) !important; }
.${THREAD_CLASS} .s1-code-line .s1-fn { color: var(--idea-fn) !important; }
.${THREAD_CLASS} .s1-code-line .s1-cmt { color: var(--idea-cmt) !important; }
.${THREAD_CLASS} .s1-code-line a { color: var(--idea-str) !important; text-decoration: underline !important; text-underline-offset: 2px; }

/* 图片：折叠为一行 // image，悬浮/聚焦/点击固定才展开 */
.${THREAD_CLASS} .s1-code-line.s1-code-image { cursor: pointer; overflow: visible !important; }
.${THREAD_CLASS} .s1-code-line.s1-code-image > .s1-cmt::after { content: " · hover"; opacity: .55; }
.${THREAD_CLASS} .s1-code-line.s1-code-image:hover > .s1-cmt::after,
.${THREAD_CLASS} .s1-code-line.s1-code-image:focus-within > .s1-cmt::after,
.${THREAD_CLASS} .s1-code-line.s1-code-image.is-open > .s1-cmt::after,
.${THREAD_CLASS} .s1-code-line.s1-code-image.is-pinned > .s1-cmt::after { content: "" !important; }
.${THREAD_CLASS} .s1-code-line.s1-code-image .s1-code-image-preview {
  display: none !important; max-width: min(100%, 720px) !important; width: auto !important; height: auto !important;
  margin: 6px 0 4px 24px !important; border: 1px solid var(--idea-line-soft) !important; border-radius: 2px !important;
  visibility: hidden !important; opacity: 0 !important;
}
.${THREAD_CLASS} .s1-code-line.s1-code-image:hover .s1-code-image-preview,
.${THREAD_CLASS} .s1-code-line.s1-code-image:focus-within .s1-code-image-preview,
.${THREAD_CLASS} .s1-code-line.s1-code-image.is-open .s1-code-image-preview,
.${THREAD_CLASS} .s1-code-line.s1-code-image.is-pinned .s1-code-image-preview {
  display: block !important; visibility: visible !important; opacity: 1 !important;
}

/* ---- 状态栏 ---- */
.${THEME_CLASS} .s1-idea-statusbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 900; height: 22px; padding: 0 12px;
  display: flex; align-items: center; gap: 14px; background: var(--idea-panel);
  border-top: 1px solid var(--idea-line); color: var(--idea-text-3); font-size: 11px;
  font-family: "JetBrains Mono", Menlo, Consolas, monospace; pointer-events: none;
}
.${THEME_CLASS} #ft { padding-bottom: 30px !important; }
.${THEME_CLASS} #ft,
.${THEME_CLASS} #flk { background: transparent !important; color: var(--idea-text-3) !important; }
`;

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
    return true;
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

    const brand = document.createElement("span");
    brand.className = "s1-idea-brand";
    const repo = document.createElement("a");
    repo.href = REPO_URL; repo.target = "_blank"; repo.rel = "noopener noreferrer";
    repo.innerHTML = BRAND_SVG + "s1-idea-ui";
    repo.title = "GitHub 仓库：hosinokoe/s1-idea-ui";
    const sep = document.createElement("span");
    sep.className = "s1-idea-brand-sep"; sep.textContent = "·";
    const board = document.createElement("a");
    board.href = BOARD_URL; board.textContent = "Stage1st"; board.title = "Stage1st · 2b 版块";
    brand.append(repo, sep, board);
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
      "<span>UTF-8</span><span>4 spaces</span><span>Java</span>" +
      "<span>Discuz! X3.5</span><span>Darcula · Stage1st</span>";
    document.body.appendChild(bar);
  }

  // 把站点 favicon 换成 IDEA 风格方块（参考原作者 makeFavicon）。
  const FAVICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="32" height="32">' +
    '<rect x="0" y="0" width="16" height="16" rx="3" fill="#000"/>' +
    '<rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="#4A9FD8" stroke-width="1.4"/>' +
    '<rect x="3.5" y="10.5" width="5" height="1.4" fill="#4A9FD8"/>' +
    "</svg>";
  function makeFavicon() {
    const head = document.head;
    if (!head) return;
    const href = "data:image/svg+xml," + encodeURIComponent(FAVICON_SVG);
    // 干掉站点原有 icon，避免它盖回去。
    for (const link of head.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')) {
      if (link.id !== "s1-idea-favicon") link.remove();
    }
    let icon = document.getElementById("s1-idea-favicon");
    if (!icon) {
      icon = document.createElement("link");
      icon.id = "s1-idea-favicon";
      icon.rel = "icon";
      icon.type = "image/svg+xml";
      head.appendChild(icon);
    }
    if (icon.getAttribute("href") !== href) icon.setAttribute("href", href);
  }

  // ---- 列表页 git-graph（沿用之前实现） ----
  function buildGitSvg(seed) {
    const lane = seed % 3;
    const x = 6 + lane * 10;
    const color = GIT_COLORS[seed % GIT_COLORS.length];
    const branch = (seed >> 2) % 4 === 0;
    let parts = `<line x1="${x}" y1="0" x2="${x}" y2="20" stroke="${color}" stroke-width="1.4"/>`;
    if (branch && lane < 2) {
      const x2 = x + 10;
      const c2 = GIT_COLORS[(seed + 1) % GIT_COLORS.length];
      parts += `<path d="M${x} 10 C ${(x + x2) / 2} 10, ${(x + x2) / 2} 4, ${x2} 4" fill="none" stroke="${c2}" stroke-width="1.4"/>`;
    }
    parts += `<circle cx="${x}" cy="10" r="3.2" fill="${color}" stroke="var(--idea-editor)" stroke-width="1.2"/>`;
    return `<svg viewBox="0 0 34 20">${parts}</svg>`;
  }

  function decorateThreadList() {
    const rows = document.querySelectorAll('tbody[id^="normalthread_"], tbody[id^="stickthread_"]');
    for (const tbody of rows) {
      const titleCell = tbody.querySelector("th.new, th.common, th");
      if (!titleCell) continue;
      const anchor = titleCell.querySelector("a.xst");
      if (!anchor || titleCell.querySelector(".s1-idea-git")) continue;
      const tid = (tbody.id.match(/(\d+)/) || [])[1] || anchor.textContent || "";
      const holder = document.createElement("span");
      holder.className = "s1-idea-git";
      holder.setAttribute("aria-hidden", "true");
      holder.innerHTML = buildGitSvg(hashInt(tid, 1e6));
      titleCell.insertBefore(holder, titleCell.firstChild);
    }
  }

  // ---- 帖子页：编辑器标签页 ----
  function getTopicTitleText() {
    return (
      document.querySelector("#thread_subject")?.textContent?.trim() ||
      document.title.replace(/\s*-\s*Stage1st.*$/i, "").trim() ||
      "untitled"
    );
  }

  function decorateThread() {
    const postlist = document.getElementById("postlist");
    if (!postlist || document.getElementById("s1-idea-tab")) return;
    const fileName = sanitizeFileStem(getTopicTitleText()) + ".java";
    const tab = document.createElement("div");
    tab.id = "s1-idea-tab";
    tab.className = "s1-idea-tab";
    tab.setAttribute("aria-hidden", "true");
    tab.innerHTML =
      '<span class="s1-idea-tab-dot"></span><span>' + escapeHtml(fileName) + "</span>";
    postlist.parentNode.insertBefore(tab, postlist);
  }

  // ---- 从 Discuz 每楼里取作者 / 楼层 / 时间 ----
  function getPostAuthorName(post) {
    return (
      post.querySelector(".authi a.xw1, .authi .xw1")?.textContent?.trim() ||
      post.querySelector(".favatar .xw1, .p_pop .xw1")?.textContent?.trim() ||
      post.querySelector(".authi a")?.textContent?.trim() ||
      "unknown"
    );
  }
  function getPostFloorLabel(post) {
    return post.querySelector(".plc .pi strong a em, .plc .pi strong a")?.textContent?.trim() || "";
  }
  function getPostTimeText(post) {
    const em = post.querySelector(".authi em[id^='authorposton'], .authi .pdbt");
    const t = em?.textContent?.trim() || "";
    return t.replace(/^发表于\s*/, "");
  }

  // ---- 生成假代码头 / 尾（参考 buildHeaderLines / buildFooterLines，Java 单套） ----
  function buildHeaderLines(post, isFirst) {
    const name = getPostAuthorName(post);
    const floor = getPostFloorLabel(post);
    const time = getPostTimeText(post);
    const className = sanitizeFileStem(getTopicTitleText());
    if (isFirst) {
      return [
        "package stage1st.topics;",
        "",
        "import s1.discuz.*;",
        "",
        "/**",
        " * @author " + name,
        floor ? " * @floor " + floor : " *",
        time ? " * @since " + time : " *",
        " */",
        "public class " + className + " {",
        "",
      ];
    }
    const floorNum = (floor.match(/\d+/) || [post.getAttribute("data-floor") || "?"])[0];
    const methodName = "reply_" + sanitizeIdent(name) + "_" + floorNum;
    const meta = [floor || "#" + floorNum, time ? "@ " + time : ""].filter(Boolean).join(" ");
    return ["", "// " + meta, "@Reply", "void " + methodName + "() {"];
  }
  function buildFooterLines(isFirst) {
    return isFirst ? ["", "} // end of topic"] : ["}"];
  }

  // ---- 把 .t_f 正文节点转成一行行「代码」HTML（参考 collectCookedLineHtml） ----
  // 图片行只生成 // image 注释 HTML，真实预览图用原节点克隆（见 syncCodeFrames），
  // 因为原 <img> 已被 Discuz 以正确的 referer/会话加载，直接克隆最稳，不用猜 URL。
  function buildImageLabelHtml(src) {
    const safe = escapeHtml(src || "");
    return '<span class="s1-cmt">// image: ' + safe + "</span>";
  }

  function collectBodyLines(tf) {
    const lines = [];
    const walk = (root) => {
      for (const node of Array.from(root.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.nodeValue || "").replace(/\u00a0/g, " ");
          if (!text.trim()) continue;
          for (const row of wrapPlainText(text)) {
            lines.push({ img: null, html: commentLineHtml(" // ", escapeHtml(row)) });
          }
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = node.tagName.toLowerCase();
        // 图片（含 Discuz ignore_js_op 包裹 / lightbox）
        if (tag === "img") {
          const src = pickRealImageSrc({
            src: node.getAttribute("src") || "",
            file: node.getAttribute("file") || "",
            zoomfile: node.getAttribute("zoomfile") || "",
            "data-original": node.getAttribute("data-original") || "",
          }) || node.getAttribute("src") || "";
          lines.push({ imgNode: node, html: buildImageLabelHtml(src) });
          continue;
        }
        if (tag === "br") { continue; }
        if (tag === "pre" || node.classList.contains("blockcode")) {
          const codeText = (node.textContent || "").replace(/\r/g, "");
          lines.push({ img: null, html: commentLineHtml(" // ", "----- code -----") });
          for (const row of codeText.split("\n")) {
            lines.push({ img: null, html: highlightCode(escapeHtml(row)) });
          }
          lines.push({ img: null, html: commentLineHtml(" // ", "----- end ------") });
          continue;
        }
        if (node.querySelector && node.querySelector("img")) { walk(node); continue; }
        // 引用块
        if (tag === "blockquote" || node.classList.contains("quote")) {
          for (const row of wrapPlainText(node.textContent || "")) {
            lines.push({ img: null, html: commentLineHtml(" // > ", escapeHtml(row)) });
          }
          continue;
        }
        // 其它元素：递归；若是纯文本块，走文本分支
        if (node.childElementCount === 0) {
          const text = (node.textContent || "").replace(/\u00a0/g, " ");
          for (const row of wrapPlainText(text)) {
            lines.push({ img: null, html: commentLineHtml(" // ", escapeHtml(row)) });
          }
        } else {
          walk(node);
        }
      }
    };
    walk(tf);
    if (!lines.length) lines.push({ img: null, html: commentLineHtml(" // ", "") });
    return lines;
  }

  // 悬浮 / 聚焦显示由 CSS 负责；JS 只处理「点击固定 / 取消固定」。
  function bindCodeImageHover(root) {
    for (const line of root.querySelectorAll(".s1-code-line.s1-code-image")) {
      if (line.dataset.s1Bound === "1") continue;
      line.dataset.s1Bound = "1";
      line.addEventListener("click", () => {
        line.classList.toggle("is-pinned");
      });
    }
  }

  // 给每楼的 .t_f 建代码框，隐藏原正文。参考 syncCodeFrames。
  function syncCodeFrames() {
    const posts = document.querySelectorAll('#postlist > div[id^="post_"], #postlist table[id^="pid"]');
    const list = posts.length ? posts : document.querySelectorAll("#postlist .plhin");
    let seenFirst = false;
    for (const post of list) {
      const tf = post.querySelector(".t_f");
      if (!tf) continue;
      const isFirst = !seenFirst;
      seenFirst = true;
      const bodyLines = collectBodyLines(tf);
      const allLines = [
        ...buildHeaderLines(post, isFirst).map((t) => ({ img: null, html: highlightCode(escapeHtml(t)) })),
        ...bodyLines,
        ...buildFooterLines(isFirst).map((t) => ({ img: null, html: highlightCode(escapeHtml(t)) })),
      ];
      const signature = "v1:" + allLines.length + ":" + tf.textContent.length;

      let frame = tf.parentNode.querySelector(":scope > .s1-code-frame");
      if (!frame) {
        frame = document.createElement("div");
        frame.className = "s1-code-frame";
        const gutter = document.createElement("div");
        gutter.className = "s1-gutter"; gutter.setAttribute("aria-hidden", "true");
        const pane = document.createElement("div");
        pane.className = "s1-code-pane";
        const codeLines = document.createElement("div");
        codeLines.className = "s1-code-lines";
        pane.appendChild(codeLines);
        frame.append(gutter, pane);
        tf.parentNode.insertBefore(frame, tf);
      }
      tf.classList.add("s1-cooked-hidden");

      const codeLines = frame.querySelector(".s1-code-lines");
      const gutter = frame.querySelector(".s1-gutter");
      if (codeLines.dataset.signature !== signature) {
        codeLines.dataset.signature = signature;
        codeLines.innerHTML = allLines
          .map((l) => {
            const cls = l.imgNode ? "s1-code-line s1-code-image" : "s1-code-line";
            const tabIndex = l.imgNode ? ' tabindex="0"' : "";
            return `<div class="${cls}"${tabIndex}>${l.html || " "}</div>`;
          })
          .join("");
        // 为图片行追加「克隆的原始 <img>」作预览：原图已被 Discuz 以正确
        // referer/会话加载好，克隆它比重新猜 URL 更可靠（悬浮必出图）。
        const lineEls = codeLines.querySelectorAll(".s1-code-line");
        allLines.forEach((l, i) => {
          if (!l.imgNode || !lineEls[i]) return;
          const preview = l.imgNode.cloneNode(true);
          preview.className = "s1-code-image-preview";
          preview.removeAttribute("width");
          preview.removeAttribute("height");
          preview.removeAttribute("style");
          preview.removeAttribute("onmouseover");
          preview.removeAttribute("onclick");
          const real = pickRealImageSrc({
            src: l.imgNode.getAttribute("src") || "",
            file: l.imgNode.getAttribute("file") || "",
            zoomfile: l.imgNode.getAttribute("zoomfile") || "",
            "data-original": l.imgNode.getAttribute("data-original") || "",
          });
          if (real) preview.src = real;
          lineEls[i].appendChild(preview);
        });
        bindCodeImageHover(codeLines);
        let text = "";
        for (let i = 1; i <= allLines.length; i++) text += i + "\n";
        gutter.textContent = text;
      }
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
    makeFavicon();

    if (type === "forum") decorateThreadList();
    if (type === "thread") { decorateThread(); syncCodeFrames(); }
  }

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
    let scheduled = false;
    const obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const type = detectPageType(location.pathname, location.search);
        if (type === "forum") decorateThreadList();
        if (type === "thread") { decorateThread(); syncCodeFrames(); }
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
