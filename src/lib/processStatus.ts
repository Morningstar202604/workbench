/**
 * 进程状态归一化。
 *
 * 后端现在发 ASCII 键（Run / Sleep / …），但历史快照、旧版数据与
 * 演示数据里可能存在上一版直接发出的中文标签。两层都认，界面只显示
 * 当前语言的状态名——状态属于系统词汇，不该跟着后端语言漂移。
 */
export type StatusKey =
  | "run"
  | "sleep"
  | "idle"
  | "stop"
  | "zombie"
  | "dead"
  | "tracing"
  | "wakekill"
  | "waking"
  | "parked"
  | "lockBlocked"
  | "diskSleep"
  | "unknown";

const MAP: Record<string, StatusKey> = {
  run: "run",
  running: "run",
  sleep: "sleep",
  sleeping: "sleep",
  idle: "idle",
  stop: "stop",
  stopped: "stop",
  zombie: "zombie",
  dead: "dead",
  tracing: "tracing",
  wakekill: "wakekill",
  waking: "waking",
  parked: "parked",
  lockblocked: "lockBlocked",
  uninterruptibledisksleep: "diskSleep",
  disksleep: "diskSleep",
  运行中: "run",
  休眠: "sleep",
  空闲: "idle",
  已停止: "stop",
  僵尸: "zombie",
  已终止: "dead",
  追踪中: "tracing",
  唤醒中: "wakekill",
  正在唤醒: "waking",
  已停放: "parked",
  锁阻塞: "lockBlocked",
  磁盘休眠: "diskSleep",
};

export function statusKeyOf(raw: string): StatusKey {
  return MAP[raw.trim().toLowerCase()] ?? "unknown";
}
