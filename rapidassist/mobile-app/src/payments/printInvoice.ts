import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export async function printInvoice(html: string) {
  const file = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) throw new Error("PDF sharing is unavailable on this device.");
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Share RapidAssist invoice" });
}
