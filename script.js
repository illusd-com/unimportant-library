/* 不重要圖書館 — mobile nav, stagger, online borrow form
   Borrow → POST /api/borrow（伺服器寫入排程 + webhook；不含身分證）
*/

(function () {
  "use strict";

  /* —— Mobile nav —— */
  const menuToggle = document.getElementById("menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", function () {
      const open = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!open));
      mobileNav.hidden = open;
      mobileNav.setAttribute("data-open", String(!open));
    });

    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menuToggle.setAttribute("aria-expanded", "false");
        mobileNav.hidden = true;
        mobileNav.setAttribute("data-open", "false");
      });
    });
  }

  /* —— Stagger —— */
  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!prefersReduced && "IntersectionObserver" in window) {
    const items = document.querySelectorAll("[data-stagger]");
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const el = entry.target;
            const index = Array.prototype.indexOf.call(items, el);
            el.style.transitionDelay = Math.min(index * 40, 320) + "ms";
            el.classList.add("is-visible");
            observer.unobserve(el);
          }
        });
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0.08 }
    );
    items.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    document.querySelectorAll("[data-stagger]").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* —— Borrow form —— */
  const form = document.getElementById("borrow-form");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("borrow-submit");

  function showStatus(msg, type) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className =
      "form-status " + (type === "success" ? "is-success" : "is-error");
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const bookTitle = (document.getElementById("book-title").value || "").trim();
      const fullName = (document.getElementById("full-name").value || "").trim();
      const idNumber = (document.getElementById("id-number").value || "").trim();

      if (!bookTitle) {
        showStatus("請輸入完整書名。", "error");
        return;
      }
      if (!fullName) {
        showStatus("請輸入完整姓名。", "error");
        return;
      }
      if (!idNumber) {
        showStatus("請輸入身分證字號。", "error");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "送出中…";
      }

      try {
        // 身分證僅在前端檢查「有填」，不送後端
        const res = await fetch("/api/borrow", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({
            bookTitle: bookTitle,
            fullName: fullName,
          }),
        });

        const data = await res.json().catch(function () {
          return {};
        });

        if (!res.ok) {
          throw new Error(data.error || "HTTP " + res.status);
        }

        showStatus(
          "借書申請已送出。預計 7 天內送達，借閱期限 20 天；逾期每日 1 巴拉。" +
            (data.scheduled
              ? " 系統已排程於到期前一天自動提醒。"
              : ""),
          "success"
        );
        form.reset();
      } catch (err) {
        console.error(err);
        showStatus("送出失敗，請稍後再試或聯絡館方。", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "確認借書";
        }
      }
    });
  }
})();
