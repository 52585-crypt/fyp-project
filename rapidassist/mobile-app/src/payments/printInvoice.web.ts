export async function printInvoice(html: string) {
  const invoiceWindow = window.open("", "_blank");
  if (!invoiceWindow) throw new Error("Allow pop-ups for RapidAssist to print or save your invoice.");
  invoiceWindow.opener = null;
  invoiceWindow.document.open();
  invoiceWindow.document.write(html);
  invoiceWindow.document.close();
  invoiceWindow.focus();
  invoiceWindow.print();
}
