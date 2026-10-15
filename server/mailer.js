// Sends email with SMTP (nodemailer). With no SMTP settings, emails are printed to the terminal and saved in data/outbox/.
const fs = require("fs");
const path = require("path");

const FROM = process.env.MAIL_FROM || "Pocket Ledger <no-reply@example.com>";
let transporter = null;

if (process.env.SMTP_HOST) {
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true" || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
} else {
  console.warn("! SMTP is not configured. Emails (codes, exports) will be printed here and saved in data/outbox/.");
}

async function sendMail({ to, subject, text, html, attachments }) {
  if (transporter) {
    await transporter.sendMail({ from: FROM, to, subject, text, html, attachments });
    return { sent: true };
  }
  const dir = path.join(__dirname, "..", "data", "outbox");
  fs.mkdirSync(dir, { recursive: true });
  let body = `To: ${to}\nSubject: ${subject}\n\n${text}\n`;
  for (const a of attachments || []) body += `\n--- attachment: ${a.filename} ---\n${a.content}\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(dir, `${stamp}-${to.replace(/[^a-z0-9@._-]/gi, "_")}.txt`), body);
  console.log(`\n[email to ${to}] ${subject}\n${text}\n`);
  return { sent: false, dev: true };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function shell(inner) {
  return `<div style="font-family:Georgia,serif;background:#f4f1e8;padding:24px"><div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e3dcc8;border-top:4px solid #c9a24a;border-radius:8px;padding:28px;color:#10233d">
<div style="font-size:12px;letter-spacing:3px;color:#8a6f2a">POCKET LEDGER</div>${inner}
<p style="font-size:12px;color:#667085;margin-top:24px">If you did not request this, you can ignore this email.</p></div></div>`;
}

function codeEmail(firstName, code, purpose) {
  const reg = purpose === "register";
  const subject = reg ? "Verify your email for Pocket Ledger" : "Your Pocket Ledger sign-in code";
  const lead = reg ? "Welcome! Use this code to verify your email and finish creating your account." : "Use this code to finish signing in.";
  const text = `Hi ${firstName || "there"},\n\n${lead}\n\nYour code: ${code}\n\nIt expires in 10 minutes.\n`;
  const html = shell(`<h2 style="margin:16px 0 8px">Hi ${esc(firstName || "there")},</h2><p>${lead}</p>
<div style="font-size:34px;letter-spacing:10px;font-weight:bold;background:#f4f1e8;border-radius:8px;text-align:center;padding:16px;margin:18px 0">${code}</div>
<p style="font-size:13px;color:#667085">It expires in 10 minutes.</p>`);
  return { subject, text, html };
}

function exportEmail(firstName, filename, format) {
  const subject = "Your Pocket Ledger export";
  const text = `Hi ${firstName || "there"},\n\nYour ${format.toUpperCase()} export is attached (${filename}).\n`;
  const html = shell(`<h2 style="margin:16px 0 8px">Hi ${esc(firstName || "there")},</h2><p>Your ${esc(format.toUpperCase())} export is attached: <b>${esc(filename)}</b>.</p>`);
  return { subject, text, html };
}

module.exports = { sendMail, codeEmail, exportEmail };
