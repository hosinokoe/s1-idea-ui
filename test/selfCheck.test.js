// 纯函数断言测试（node 运行，无框架）。
// 用法: node test/selfCheck.test.js
const assert = require("assert");
const {
  detectPageType,
  pickRealImageSrc,
  escapeHtml,
  selfCheck,
} = require("../s1-idea.user.js");

// 页面类型判定
assert.strictEqual(detectPageType("/2b/forum-4-1.html", ""), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", "?gid=1"), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", ""), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", "?mod=forumdisplay&fid=4"), "forum");
assert.strictEqual(detectPageType("/2b/thread-2290108-1-1.html", ""), "thread");
assert.strictEqual(detectPageType("/2b/forum.php", "?mod=viewthread&tid=1"), "thread");
assert.strictEqual(detectPageType("/2b/member.php", "?mod=logging"), "other");

// 懒加载图片真实 URL 选择
assert.strictEqual(pickRealImageSrc({ src: "x.gif", zoomfile: "real.jpg" }), "real.jpg");
assert.strictEqual(pickRealImageSrc({ src: "x.gif", file: "real.png" }), "real.png");
assert.strictEqual(
  pickRealImageSrc({ src: "x.gif", "data-original": "real.webp" }),
  "real.webp"
);
// zoomfile 优先于 file
assert.strictEqual(
  pickRealImageSrc({ src: "x.gif", file: "f.png", zoomfile: "z.jpg" }),
  "z.jpg"
);
// 已经是真 src，不用改
assert.strictEqual(pickRealImageSrc({ src: "real.jpg" }), null);
// 空白候选忽略
assert.strictEqual(pickRealImageSrc({ src: "real.jpg", zoomfile: "  " }), null);
// 占位 src 跳过，改用 file
assert.strictEqual(
  pickRealImageSrc({ src: "static/image/common/none.gif", file: "real.jpg" }),
  "real.jpg"
);

// HTML 转义
assert.strictEqual(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");

// 脚本自带的自检
assert.strictEqual(selfCheck(), true);

console.log("all tests passed");
