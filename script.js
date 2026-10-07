/* 不重要圖書館 — mobile nav, stagger, online borrow form
   Webhook: book title + name + dates only (NO national ID)
*/

(function () {
  "use strict";

  const WEBHOOK_URL =
    "https://chat.googleapis.com/v1/spaces/AAQALYDXcXQ/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=6UO5wZjt_tl469AKNg7MDCOtHKcG8UFOPAcrbxp8qzQ";

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

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  /* —— Borrow form —— */
  const form = document.getElementById("borrow-form");
  const statusEl = document.getElementById("form-status");
  const submitBtn = document.getElementById("borrow-submit");

  function showStatus(msg, type) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = "form-status " + (type === "success" ? "is-success" : "is-error");
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

      const now = new Date();
      const deliveryBy = addDays(now, 7);
      const dueDate = addDays(deliveryBy, 20);

      // Payload: all form data EXCEPT national ID
      const text =
        "📚 不重要圖書館 · 新借書申請\n\n" +
        "書名：" + bookTitle + "\n" +
        "借閱人：" + fullName + "\n" +
        "申請時間：" + formatDate(now) + " " +
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0") + "\n" +
        "預計送達期限：申請後 7 日內（最晚 " + formatDate(deliveryBy) + "）\n" +
        "借閱期限：送達後 20 天（約至 " + formatDate(dueDate) + "）\n" +
        "逾期費用：1 巴拉／天\n\n" +
        "（身分證字號已依政策排除，未傳送）";

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "送出中…";
      }

      try {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8" },
          body: JSON.stringify({ text: text }),
        });

        if (!res.ok) {
          throw new Error("Webhook HTTP " + res.status);
        }

        showStatus(
          "借書申請已送出。預計 7 天內送達，借閱期限 20 天；逾期每日 1 巴拉。",
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
