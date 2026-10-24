/**
 * 表格导出。CSV 是唯一一种「双击就能在 Excel/Numbers 打开」的格式，
 * 因此也是注入面最大的格式：以 = + - @ 开头的单元格会被 Excel 当公式执行。
 * 这里统一加单引号前缀（业界通行做法），并把逗号/引号/换行整体引用。
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** 触发浏览器/WebView 下载。不依赖 Tauri 的文件对话框，离线可用。 */
export function downloadText(filename: string, text: string, mime = "text/csv"): void {
  const blob = new Blob([`\ufeff${text}`], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
