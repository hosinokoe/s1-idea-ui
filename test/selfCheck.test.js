// 纯函数断言测试（node 运行，无框架）。
// 用法: node test/selfCheck.test.js
const assert = require("assert");
const {
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
} = require("../s1-idea.user.js");

// 页面类型判定
assert.strictEqual(detectPageType("/2b/forum-4-1.html", ""), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", "?gid=1"), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", ""), "forum");
assert.strictEqual(detectPageType("/2b/forum.php", "?mod=forumdisplay&fid=4"), "forum");
assert.strictEqual(detectPageType("/2b/thread-2290108-1-1.html", ""), "thread");
assert.strictEqual(detectPageType("/2b/forum.php", "?mod=viewthread&tid=1"), "thread");
assert.strictEqual(detectPageType("/2b/member.php", "?mod=logging"), "other");

// hashInt
assert.strictEqual(hashInt("abc", 6), hashInt("abc", 6));
assert.ok(hashInt("abc", 6) >= 0 && hashInt("abc", 6) < 6);
assert.notStrictEqual(hashInt("2290108", 1000000), hashInt("2290109", 1000000));

// 文件名 / 标识符清洗
assert.strictEqual(sanitizeFileStem("Hello / World?"), "Hello_World");
assert.strictEqual(sanitizeFileStem("   "), "untitled");
assert.strictEqual(sanitizeIdent("张三 A.b"), "A_b");
assert.strictEqual(sanitizeIdent("reply 2"), "reply_2");
assert.strictEqual(sanitizeIdent(""), "user");

// 懒加载图片真实 URL
assert.strictEqual(pickRealImageSrc({ src: "x.gif", zoomfile: "real.jpg" }), "real.jpg");
assert.strictEqual(pickRealImageSrc({ src: "x.gif", file: "real.png" }), "real.png");
assert.strictEqual(pickRealImageSrc({ src: "real.jpg" }), null);
assert.strictEqual(
  pickRealImageSrc({ src: "static/image/common/none.gif", file: "r.jpg" }),
  "r.jpg"
);

// 折行（CJK 按 code point）
assert.deepStrictEqual(wrapPlainText(""), [""]);
assert.strictEqual(wrapPlainText("a b  c").join("|"), "a b c");
assert.strictEqual(wrapPlainText("abcdef", 3).join("|"), "abc|def");
assert.strictEqual(wrapPlainText("你好世界一二三", 3).length, 3);

// 注释行 / 语法色
assert.ok(commentLineHtml("// ", "hi").includes("s1-cmt"));
assert.ok(highlightCode("public class Foo {").includes("s1-kw"));
assert.ok(highlightCode("// hello").includes("s1-cmt"));
assert.ok(highlightCode("var msg = &quot;hi&quot;;").includes("s1-str"));

// HTML 转义
assert.strictEqual(escapeHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");

// 脚本自带自检
assert.strictEqual(selfCheck(), true);

console.log("all tests passed");
