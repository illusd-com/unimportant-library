/**
 * POST /api/borrow
 * 接收借書申請 → 寫入 data/loans.json → 發送申請 webhook
 * 身分證字號不入庫、不傳送
 */
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  "https://chat.googleapis.com/v1/spaces/AAQALYDXcXQ/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=6UO5wZjt_tl469AKNg7MDCOtHKcG8UFOPAcrbxp8qzQ";

const GH_OWNER = process.env.GITHUB_OWNER || "illusd-com";
const GH_REPO = process.env.GITHUB_REPO || "unimportant-library";
const LOANS_PATH = "data/loans.json";

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

function buildReminderMsg(surname, bookTitle) {
  return (
    surname +
    "先生/小姐您好\n" +
    "您於「不重要圖書館」借閱之書  " +
    bookTitle +
    "   即將在後天逾期\n" +
    "若未將書籍歸還於7-ElEVEN 糖村門市\n" +
    "您將會收到罰款，重則提告\n" +
    "由於書籍為「台灣台北市圖書館」代借\n" +
    "若有破損將依法求償"
  );
}

async function ghGetLoans(token) {
  const url =
    "https://api.github.com/repos/" +
    GH_OWNER +
    "/" +
    GH_REPO +
    "/contents/" +
    LOANS_PATH;
  const res = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "unimportant-library",
    },
  });
  if (res.status === 404) {
    return { loans: [], sha: null };
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error("GitHub GET loans: " + res.status + " " + t);
  }
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  let loans = [];
  try {
    loans = JSON.parse(content);
    if (!Array.isArray(loans)) loans = [];
  } catch (_) {
    loans = [];
  }
  return { loans: loans, sha: data.sha };
}

async function ghPutLoans(token, loans, sha, message) {
  const url =
    "https://api.github.com/repos/" +
    GH_OWNER +
    "/" +
    GH_REPO +
    "/contents/" +
    LOANS_PATH;
  const body = {
    message: message,
    content: Buffer.from(JSON.stringify(loans, null, 2), "utf8").toString(
      "base64"
    ),
    branch: "main",
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "unimportant-library",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("GitHub PUT loans: " + res.status + " " + t);
  }
  return res.json();
}

async function sendWebhook(text) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ text: text }),
  });
  if (!res.ok) {
    throw new Error("Webhook HTTP " + res.status);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const bookTitle = String(body.bookTitle || "").trim();
    const fullName = String(body.fullName || "").trim();

    if (!bookTitle) {
      return res.status(400).json({ error: "請輸入完整書名" });
    }
    if (!fullName) {
      return res.status(400).json({ error: "請輸入完整姓名" });
    }

    const now = new Date();
    const deliveryBy = addDays(now, 7);
    const dueDate = addDays(deliveryBy, 20);
    const remindDate = addDays(dueDate, -1);
    const surname = fullName.charAt(0);
    const reminderMsg = buildReminderMsg(surname, bookTitle);
    const id =
      "loan_" +
      now.getTime() +
      "_" +
      Math.random().toString(36).slice(2, 8);

    const loan = {
      id: id,
      bookTitle: bookTitle,
      fullName: fullName,
      surname: surname,
      appliedAt: now.toISOString(),
      deliveryBy: formatDate(deliveryBy),
      dueDate: formatDate(dueDate),
      remindDate: formatDate(remindDate),
      reminderMsg: reminderMsg,
      reminded: false,
    };

    const token = process.env.GITHUB_TOKEN;
    let saved = false;
    if (token) {
      const { loans, sha } = await ghGetLoans(token);
      loans.push(loan);
      await ghPutLoans(
        token,
        loans,
        sha,
        "loan: " + bookTitle + " / " + fullName
      );
      saved = true;
    }

    const text =
      "📚 不重要圖書館 · 新借書申請\n\n" +
      "書名：" +
      bookTitle +
      "\n" +
      "借閱人：" +
      fullName +
      "\n" +
      "申請時間：" +
      formatDate(now) +
      " " +
      String(now.getHours()).padStart(2, "0") +
      ":" +
      String(now.getMinutes()).padStart(2, "0") +
      "\n" +
      "預計送達期限：申請後 7 日內（最晚 " +
      formatDate(deliveryBy) +
      "）\n" +
      "借閱期限：送達後 20 天（約至 " +
      formatDate(dueDate) +
      "）\n" +
      "逾期費用：1 巴拉／天\n" +
      "⏰ 到期提醒日：" +
      formatDate(remindDate) +
      "（系統將自動發送）\n" +
      "紀錄：" +
      (saved ? "已排程自動提醒" : "未寫入排程（缺 GITHUB_TOKEN）") +
      "\n\n" +
      "（身分證字號已依政策排除，未傳送）";

    await sendWebhook(text);

    return res.status(200).json({
      ok: true,
      id: id,
      dueDate: loan.dueDate,
      remindDate: loan.remindDate,
      scheduled: saved,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
