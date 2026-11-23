import { formatPaymentAmount, paymentStatusLabel, type PaymentBundle } from "./payments.api";
import { tokens } from "../design/tokens";

function escapeHtml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (char) => entities[char]);
}

export function buildInvoiceDocument({ invoice, payment }: PaymentBundle) {
  const money = (amount: number) => escapeHtml(formatPaymentAmount(amount, invoice.currency));
  const number = escapeHtml(invoice.invoiceNumber);
  const rows = invoice.lines.map(({ label, amountMinor }) =>
    `<tr><td>${escapeHtml(label)}</td><td>${money(amountMinor)}</td></tr>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>RapidAssist Invoice ${number}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 32px; color: ${tokens.color.text}; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; }
    td + td { text-align: right; }
    tfoot { font-weight: bold; border-top: 2px solid ${tokens.color.text}; }
  </style>
</head>
<body>
  <h1>RapidAssist</h1>
  <h2>Invoice ${number}</h2>
  <p>Finalized ${escapeHtml(new Date(invoice.finalizedAt).toLocaleString())}</p>
  <table>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Total</td><td>${money(invoice.totalMinor)}</td></tr></tfoot>
  </table>
  <p>Payment: ${escapeHtml(paymentStatusLabel(payment))}</p>
</body>
</html>`;
}
