// 运行日志页文案。key 约定：前缀 "logs." + 语义名；三语必须同 key 同全。
// 由页面转换时填充；插值用 {name} 占位。
export const dict = {
  en: {
    "logs.title": "Logs",
    "logs.autoRefresh": "Auto refresh",
    "logs.refresh": "Refresh",
    "logs.clear": "Clear",
    "logs.empty": "(No logs)",
    "logs.unavailable": "(Logs unavailable — written only when running on desktop)",
    "logs.cleared": "(Cleared)",
    "logs.clearedToast": "Logs cleared",
    "logs.clearFailed": "Failed to clear logs",
  },
  zh: {
    "logs.title": "运行日志",
    "logs.autoRefresh": "自动刷新",
    "logs.refresh": "刷新",
    "logs.clear": "清空",
    "logs.empty": "(暂无日志)",
    "logs.unavailable": "(日志暂不可用 — 仅在桌面端运行时写入)",
    "logs.cleared": "(已清空)",
    "logs.clearedToast": "日志已清空",
    "logs.clearFailed": "清空日志失败",
  },
  ja: {
    "logs.title": "ログ",
    "logs.autoRefresh": "自動更新",
    "logs.refresh": "更新",
    "logs.clear": "クリア",
    "logs.empty": "（ログはありません）",
    "logs.unavailable": "（ログを利用できません — デスクトップ実行時のみ書き込まれます）",
    "logs.cleared": "（クリア済み）",
    "logs.clearedToast": "ログをクリアしました",
    "logs.clearFailed": "ログのクリアに失敗",
  },
} as const;
