window.__ModuleLoader__.load({
  id: "dsh-patch-opencode-display",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const STYLE_ID = "dsh-patch-opencode-display-style";
    // 隐藏 Go· 品牌，零额外右边距：display:none 完全脱离布局，不留 gap
    // 用 [class*="_brand"] 命中 dsh-opencode-go 的 hashed 品牌类（mAjYhq_brand 等随版本变）
    // 必须以前缀限定在卡片内：侧栏 logo 容器类名也带 _brand（见 theme-manager 的
    // [data-slot=sidebar] [class$=_brand]），全局匹配会把左上 logo 一起藏掉。
    // 2026-10-18 停用搬移：跨容器搬 React 托管节点会导致卸载时 removeChild
    // NotFoundError，炸掉整个 conversation.input.right 槽（连累同槽其他
    // entry）。pill 留在行内显示，只保留文案/品牌修正。
    const CSS = '[data-composer-card] [class*="_brand"]{display:none!important}'
      + '[data-dsh-compact-hidden]{display:none!important}';

    // （搬移已于 2026-10-18 停用，见 CSS 上方注释；下面函数保留不再调用，
    // 只做文案修正 patchText + 样式注入。）
    const DOCK_SEL = "[data-composer-dock]";
    const CARD_SEL = "[data-composer-card]";
    let relocateScheduled = false;

    function findPillRoots() {
      const cards = document.querySelectorAll(CARD_SEL);
      if (!cards.length) return [];
      const roots = new Set();
      cards.forEach((card) => {
        card.querySelectorAll('button[class*="_trigger"]').forEach((trigger) => {
          if (!trigger.querySelector('[class*="_reading"]')) return;
          if (trigger.closest(DOCK_SEL)) return; // 已在 dock 内，不必再搬
          const root = trigger.parentElement;
          if (root && root.tagName === "SPAN") roots.add(root);
        });
      });
      return [...roots];
    }

    // 已在 dock 内的标记 pill：收敛到最前面。已收敛（前 N 个恰好就是它们
    // 且顺序一致）则不动，避免反复翻转触发多余 mutation。
    function orderMarkedFirst(dock) {
      try {
        const kids = [...dock.children];
        const marked = kids.filter((el) => el.hasAttribute && el.hasAttribute("data-dsh-opencode-relocated"));
        if (!marked.length) return false;
        const leading = kids.slice(0, marked.length);
        if (leading.length === marked.length && leading.every((el, i) => el === marked[i])) return false;
        for (let i = marked.length - 1; i >= 0; i--) {
          dock.insertBefore(marked[i], dock.firstElementChild);
        }
        return true;
      } catch (e) { /* 保守：失败即保持原位 */ return false; }
    }

    function relocatePill() {
      return false; // 搬移已停用：跨容器搬 React 托管节点会炸卸载（removeChild）。
      const roots = findPillRoots();
      let moved = false;
      for (const root of roots) {
        // 就近配对：从 pill 向上找同时含 dock 的最近祖先 composer 容器（card 与 dock
        // 是该容器下的兄弟节点）。找不到则放弃搬移、保持原位，绝不使用全局 dock。
        let dock = null;
        let anc = root.parentElement;
        while (anc && anc !== document.documentElement) {
          if (anc.querySelector && anc.querySelector(":scope > " + DOCK_SEL)) {
            dock = anc.querySelector(":scope > " + DOCK_SEL);
            break;
          }
          anc = anc.parentElement;
        }
        if (!dock || !dock.isConnected) continue;
        // 新节点直接放最前面；已是首位则不动（避免自插异常与多余 mutation）
        try {
          if (root.parentElement !== dock || dock.firstElementChild !== root) {
            dock.insertBefore(root, dock.firstElementChild);
            moved = true;
          }
        } catch (e) { continue; }
        root.dataset.dshOpencodeRelocated = "true";
      }
      // 上轮已搬到末尾的老节点：一并收敛到最前面
      document.querySelectorAll(DOCK_SEL).forEach((dock) => {
        if (orderMarkedFirst(dock)) moved = true;
      });
      return moved;
    }

    function scheduleRelocate() {
      if (relocateScheduled) return;
      relocateScheduled = true;
      setTimeout(() => {
        relocateScheduled = false;
        try { relocatePill(); } catch (e) { /* 保守：失败即保持原位 */ }
      }, 150);
    }

    function injectStyle() {
      if (!document.head) return;
      let el = document.getElementById(STYLE_ID);
      if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID;
        document.head.appendChild(el);
      }
      if (el.textContent !== CSS) el.textContent = CSS;
    }

    // 简洁模式（对齐 codex 行内形态）：用量行内只留 5h 窗口。
    // reading 子树结构（dsh-opencode-go client.js UsagePill）：
    //   span.unit["5h"," "] , pct文本 , "%" , " · " , span.unit["周"," "] , pct文本 , "%"
    // stale/fallback/账号尾巴是 reading 的兄弟 span，不在子树内，不受影响。
    //
    // 2026-10-20 修复「偶尔漏出周额度」：旧实现只用文本 "·" 当裁剪锚点，
    // 第一次裁剪就把 "·" 清成空串；之后 React 写回 weekly.percent 时是纯数字
    // characterData（如 "54"），不匹配 observer 的任何字符串条件，且锚点已消失
    // 导致重裁永远 no-op，周段百分比就漏出来。现改为：
    //   ① 仍优先用 "·" 定位（结构未裁时最准）；
    //   ② 找不到 "·"（已裁过）则按槽位：首个 _unit 之后保留 2 个节点（percent + "%"）；
    //   ③ 幂等：置空前判空，不会自己触发新的 characterData 死循环。
    const HIDE_ATTR = "data-dsh-compact-hidden";
    function hideNode(n) {
      if (n.nodeType === 3) { if (n.nodeValue !== "") n.nodeValue = ""; return; }
      if (!n.hasAttribute(HIDE_ATTR)) n.setAttribute(HIDE_ATTR, "");
    }
    function showNode(n) {
      if (n.nodeType === 1 && n.hasAttribute(HIDE_ATTR)) n.removeAttribute(HIDE_ATTR);
    }
    function compactReading(reading) {
      const kids = [...reading.childNodes];
      if (!kids.length) return;
      let cut = -1;
      for (let i = 0; i < kids.length; i++) {
        const n = kids[i];
        if (n.nodeType === 3 && n.nodeValue && n.nodeValue.indexOf("·") !== -1) { cut = i; break; }
      }
      if (cut < 0) {
        for (let i = 0; i < kids.length; i++) {
          const n = kids[i];
          if (n.nodeType === 1 && typeof n.className === "string" && n.className.indexOf("_unit") !== -1) {
            cut = i + 3; // unit + percent + "%"
            break;
          }
        }
      }
      if (cut < 0) return;
      kids.forEach((n, i) => (i < cut ? showNode(n) : hideNode(n)));
    }

    // 归属判断：pill 按钮的无障碍标签里带 "CommandCode" 的就是
    // dsh-commandcode-go 的卡片（中英文案都带这个词），直接跳过。
    // 大小写敏感是刻意的：opencode-go 的标签里只有 "Go"，不会误伤；
    // 标签还没挂载时按非 CommandCode 处理走正常流程（空卡片本来就是 no-op）。
    function isCommandCodeCard(node) {
      try {
        const el = node && node.nodeType === 3 ? node.parentElement : node;
        const scope = el && el.closest
          ? (el.closest(CARD_SEL) || (el.matches && el.matches(CARD_SEL) ? el : null))
          : null;
        if (!scope || !scope.querySelector) return false;
        const trigger = scope.querySelector('button[class*="_trigger"]');
        const label = trigger ? (trigger.getAttribute("aria-label") || "") : "";
        return label.indexOf("CommandCode") !== -1;
      } catch (e) { return false; }
    }

    function patchText(root = document) {
      // 只动输入卡片：全文档改字会误伤聊天正文里正常出现的 5小时。
      // 取舍：opencode 设置页会变回上游原文“5 小时”，那是它自己的页面，
      // 补丁只管行内 pill（codex 式紧凑显示），不管它。
      if (root.nodeType === 9) {
        if (root.querySelectorAll) root.querySelectorAll(CARD_SEL).forEach(card => { if (!isCommandCodeCard(card)) patchText(card) });
        return;
      }
      if (root.nodeType === 3) root = root.parentElement;
      if (!root || root.nodeType !== 1) return;
      if (root.closest && !root.closest(CARD_SEL) && !(root.matches && root.matches(CARD_SEL))) return;
      // 作用域限定（0.2.1）：只管 opencode-go 的 pill。dsh-commandcode-go 已把
      // 补丁原生做进自己（5h 源头文案 + 行内单窗口），这里必须跳过它的卡片。
      if (isCommandCodeCard(root)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const v = n.nodeValue;
        if (!v) continue;
        if (v.includes("5小时") || v.includes("5 小时")) {
          n.nodeValue = v.replaceAll("5 小时", "5h").replaceAll("5小时", "5h");
        }
        if (v.includes("Go · 5h") || v.includes("Go·5h")) {
          n.nodeValue = v.replaceAll("Go · ", "").replaceAll("Go·", "");
        }
      }
      // 行内只留 5h：裁掉 reading 内窗口分隔符及之后（周段），panel 里照样点开看
      const readings = [];
      if (root.nodeType === 1 && root.matches && root.matches('span[class*="_reading"]')) readings.push(root);
      if (root.querySelectorAll) root.querySelectorAll('span[class*="_reading"]').forEach(el => readings.push(el));
      readings.forEach(compactReading);
      root.querySelectorAll && root.querySelectorAll('[aria-label*="Go"],[title*="Go"]').forEach(el => {
        if (el.getAttribute("aria-label")?.includes("Go")) {
          el.setAttribute("aria-label", el.getAttribute("aria-label").replaceAll("Go · ", "").replaceAll("Go·", ""));
        }
        if (el.getAttribute("title")?.includes("Go")) {
          el.setAttribute("title", el.getAttribute("title").replaceAll("Go · ", "").replaceAll("Go·", ""));
        }
      });
    }

    function startObserver() {
      injectStyle();
      patchText(document);
      scheduleRelocate();
      const obs = new MutationObserver((muts) => {
        let touchedStructure = false;
        for (const m of muts) {
          // 已搬移子树内部的文本/属性变化：只做文字补丁，不触发重搬
          let inRelocated = false;
          if (m.target && m.target.closest) {
            try {
              inRelocated = !!m.target.closest('[data-dsh-opencode-relocated="true"]');
            } catch (e) { /* 文本节点无 closest，继续正常处理 */ }
          }
          if (m.type === "childList") {
            m.addedNodes.forEach(n => {
              if (n.nodeType === 1) patchText(n);
              else if (n.nodeType === 3 && n.nodeValue && (n.nodeValue.includes("5小时") || n.nodeValue.includes("Go"))) patchText(document);
            });
            if (m.target && m.target.getAttribute) patchText(m.target);
            // 结构变化且不在已搬移子树内：可能有新 pill 挂载或 slot 重排
            if (!inRelocated) touchedStructure = true;
          }
          if (m.type === "characterData" && m.target.nodeValue && (m.target.nodeValue.includes("5小时") || m.target.nodeValue.includes("Go ·"))) {
            patchText(document);
          }
          // React 每分钟刷新会把周段文本原地写回来：含 · 的恢复写入若落在 reading 内就地重裁
          //（自己置空产生的突变值为空，不含 ·，不会自循环）
          if (m.type === "characterData" && m.target.nodeValue && m.target.nodeValue.includes("·")) {
            const p = m.target.parentElement;
            const reading = p && p.closest ? p.closest('span[class*="_reading"]') : null;
            if (reading && reading.closest && reading.closest(CARD_SEL) && !isCommandCodeCard(reading)) compactReading(reading);
          }
          if (m.type === "attributes" && (m.attributeName === "aria-label" || m.attributeName === "title")) {
            patchText(m.target);
          }
          // 兜底（2026-10-20）：reading 内任何文本/结构变化都按结构重裁。
          // React 写回周段是纯数字 characterData（"54"），上面那些字符串条件
          // （5小时 / Go · / 含 ·）全都命中不了，只能靠这里。
          if (m.type === "characterData" || m.type === "childList") {
            const t = m.target;
            const el = t.nodeType === 3 ? t.parentElement : t;
            const reading = el && el.closest ? el.closest('span[class*="_reading"]') : null;
            if (reading && reading.closest(CARD_SEL) && !isCommandCodeCard(reading)) compactReading(reading);
          }
        }
        if (touchedStructure) scheduleRelocate();
      });
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "title"]
      });
    }

    exports.apply = function(ctx) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver);
      } else {
        startObserver();
      }
      let tries = 0;
      const timer = setInterval(() => {
        injectStyle();
        patchText(document);
        try { relocatePill(); } catch (e) { /* 保守：失败即保持原位 */ }
        if (++tries > 30) clearInterval(timer);
      }, 500);
      setTimeout(() => clearInterval(timer), 16000);
    };

    exports.name = "dsh-patch-opencode-display";
    return module.exports;
  }
});
