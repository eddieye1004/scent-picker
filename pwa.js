/* pwa.js — 注册 service worker（Qoder 改造 3）
 *
 * 单独一个小文件而不是塞进 app.js：
 *   app.js 被 test-render 复制后在 node 里跑，那里没有 navigator/serviceWorker；
 *   把注册逻辑留在入口页，被测代码就永远不用为测试环境让步。
 *
 * 失败不提示：PWA 是增强，注册不上页面照常在线使用。
 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function () {
      /* 例如 file:// 打开、或部署环境不允许 SW。静默降级。 */
    });
  });
})();
