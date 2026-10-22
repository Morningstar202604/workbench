import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IPC 包装层：验证每个函数把正确的命令名与参数形状传给 invoke。
 *
 * 为什么值得测：这些函数本身只有一行，但「命令名拼错」「参数名写成
 * snake_case 而 Tauri 需要 camelCase」在类型层面看不出来，运行时才报错。
 * 这里用 mock 捕获真实调用，比读代码可靠。
 */
const invokeMock = vi.fn(async (..._args: unknown[]) => undefined as unknown);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invokeMock(...a),
}));

const api = await import("./api");

beforeEach(() => {
  invokeMock.mockClear();
});

describe("命令名与参数", () => {
  it("进程：list_processes / terminate_process(pid)", async () => {
    await api.listProcesses();
    expect(invokeMock).toHaveBeenLastCalledWith("list_processes");

    await api.terminateProcess(4321);
    expect(invokeMock).toHaveBeenLastCalledWith("terminate_process", { pid: 4321 });
  });

  it("端口与服务：无参数命令", async () => {
    await api.listPorts();
    expect(invokeMock).toHaveBeenLastCalledWith("list_ports");
    await api.listDevServers();
    expect(invokeMock).toHaveBeenLastCalledWith("list_dev_servers");
    await api.listAiProcesses();
    expect(invokeMock).toHaveBeenLastCalledWith("list_ai_processes");
  });

  it("会话详情用 camelCase 的 sessionId", async () => {
    await api.opencodeSessionDetail(4096, "sess-1");
    expect(invokeMock).toHaveBeenLastCalledWith("opencode_session_detail", {
      port: 4096,
      sessionId: "sess-1",
    });
  });

  it("数据读写", async () => {
    await api.loadData();
    expect(invokeMock).toHaveBeenLastCalledWith("load_data");
    const data = { projects: [], tasks: [] };
    await api.saveData(data);
    expect(invokeMock).toHaveBeenLastCalledWith("save_data", { data });
  });

  it("git 分支", async () => {
    await api.gitBranch("C:\\proj");
    expect(invokeMock).toHaveBeenLastCalledWith("git_branch", { dir: "C:\\proj" });
  });

  it("成本相关", async () => {
    await api.scanSessionCosts();
    expect(invokeMock).toHaveBeenLastCalledWith("scan_session_costs");
    await api.getCostOverview();
    expect(invokeMock).toHaveBeenLastCalledWith("get_cost_overview");
    await api.getCostTrend(7);
    expect(invokeMock).toHaveBeenLastCalledWith("get_cost_trend", { days: 7 });
    await api.getModelBreakdown();
    expect(invokeMock).toHaveBeenLastCalledWith("get_model_breakdown");
    await api.clearCostRecords();
    expect(invokeMock).toHaveBeenLastCalledWith("clear_cost_records");
  });

  it("成本设置透传完整对象", async () => {
    const settings = {
      daily_budget: 5,
      monthly_budget: 50,
      alert_threshold_pct: 80,
      include_estimated: true,
    };
    await api.saveCostSettings(settings);
    expect(invokeMock).toHaveBeenLastCalledWith("save_cost_settings_cmd", { settings });
  });

  it("定价读写（新增能力）", async () => {
    await api.getPricing();
    expect(invokeMock).toHaveBeenLastCalledWith("get_pricing");
    await api.savePricing({ "gpt-4o": [1, 2] });
    expect(invokeMock).toHaveBeenLastCalledWith("save_pricing", {
      overrides: { "gpt-4o": [1, 2] },
    });
  });

  it("备份", async () => {
    await api.backupData();
    expect(invokeMock).toHaveBeenLastCalledWith("backup_data");
    await api.openBackupDir();
    expect(invokeMock).toHaveBeenLastCalledWith("open_backup_dir");
  });

  it("日志读取按行数传参", async () => {
    await api.readLogs(200);
    expect(invokeMock).toHaveBeenLastCalledWith("read_logs", { maxLines: 200 });
  });

  it("系统信息与磁盘", async () => {
    await api.systemInfo();
    expect(invokeMock).toHaveBeenLastCalledWith("system_info");
    await api.diskInfo();
    expect(invokeMock).toHaveBeenLastCalledWith("disk_info");
  });

  it("置顶开关", async () => {
    await api.setAlwaysOnTop(true);
    expect(invokeMock).toHaveBeenLastCalledWith("set_always_on_top", { on: true });
  });
});

describe("openExternal 分类", () => {
  it("路径走 open_known_path（不是 opener 插件：必须过白名单）", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    await api.openExternal("C:\\proj");
    expect(invokeMock).toHaveBeenLastCalledWith("open_known_path", { path: "C:\\proj" });
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it("空串不触碰 IPC", async () => {
    invokeMock.mockClear();
    await api.openExternal("   ");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("不支持的协议抛错而不是静默", async () => {
    await expect(api.openExternal("javascript:alert(1)")).rejects.toThrow(/不支持/);
  });
});

describe("isTauri", () => {
  it("没有 __TAURI_INTERNALS__ 时为 false", () => {
    expect(api.isTauri()).toBe(false);
  });

  it("注入了 __TAURI_INTERNALS__ 时为 true", () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(api.isTauri()).toBe(true);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
});
