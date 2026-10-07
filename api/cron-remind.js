/**
 * GET /api/cron-remind
 * Vercel Cron：每日執行，對 remindDate === 今天 的借閱發送提醒訊息
 * 需 Header: Authorization: Bearer <CRON_SECRET>
 */
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  "https://chat.googleapis.com/v1/spaces/AAQALYDXcXQ/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=6UO5wZjt_tl469AKNg7MDCOtHKcG8UFOPAcrbxp8qzQ";

const GH_OWNER = process.env.GITHUB_OWNER || "illusd-com";
const GH_REPO = process.env.GITHUB_REPO || "unimportant-library";
const LOANS_PATH = "data/loans.json";

function todayStr(tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch (_) {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
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
      "User-Agent": "unimportant-library-cron",
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
      "User-Agent": "unimportant-library-cron",
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
  const auth = req.headers.authorization || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const isVercelCron = Boolean(req.headers["x-vercel-cron"]);
  const isAuthorized =
    isVercelCron ||
    (cronSecret && auth === "Bearer " + cronSecret);

  if (!isAuthorized) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: "GITHUB_TOKEN not configured",
      hint: "Add a GitHub PAT with Contents read/write on the repo",
    });
  }

  try {
    const today = todayStr("Asia/Taipei");
    const { loans, sha } = await ghGetLoans(token);
    const due = loans.filter(function (l) {
      return l && !l.reminded && l.remindDate === today;
    });

    const results = [];
    for (let i = 0; i < due.length; i++) {
      const loan = due[i];
      const text =
        "⏰ 不重要圖書館 · 到期提醒（自動）\n\n" +
        (loan.reminderMsg ||
          loan.surname +
            "先生/小姐您好\n您於「不重要圖書館」借閱之書  " +
            loan.bookTitle +
            "   即將在後天逾期\n若未將書籍歸還於7-ElEVEN 糖村門市\n您將會收到罰款，重則提告\n由於書籍為「台灣台北市圖書館」代借\n若有破損將依法求償") +
        "\n\n——\n借閱人：" +
        loan.fullName +
        "\n到期日：" +
        loan.dueDate +
        "\n申請編號：" +
        loan.id;

      try {
        await sendWebhook(text);
        loan.reminded = true;
        loan.remindedAt = new Date().toISOString();
        results.push({ id: loan.id, ok: true });
      } catch (e) {
        results.push({ id: loan.id, ok: false, error: String(e.message || e) });
      }
    }

    if (results.some(function (r) {
      return r.ok;
    })) {
      await ghPutLoans(
        token,
        loans,
        sha,
        "cron: mark reminded " + today + " (" + results.length + ")"
      );
    }

    return res.status(200).json({
      ok: true,
      today: today,
      checked: loans.length,
      sent: results.filter(function (r) {
        return r.ok;
      }).length,
      results: results,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
