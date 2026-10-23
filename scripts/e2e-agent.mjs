/**
 * Agent 对话全链路 E2E（真实 IPC + 本地 mock 模型）。
 *
 * 为什么不需要真模型：Agent 的协议就是 OpenAI chat/completions，
 * 起一个本地 HTTP 服务返回固定响应即可覆盖「发送 → 工具调用 →
 * 待审批 → 批准 → 结果回填」的完整链路。真模型只会引入费用与不确定性，
 * 不会多验证任何一行本项目代码。
 *
 * 覆盖的关键点（都是普通单测够不到的）：
 * 1. provider 配置真的进了 Rust 内存态，密钥不回显；
 * 2. 模型返回 tool_calls 时，前端收到 needs_approval 的步骤；
 * 3. 审批 token 一次性：同一 call_id 第二次批准必须失败；
 * 4. 批准后工具真的执行了（list_processes 返回非空）。
 *
 * 用法：先启动打包后的 exe（带 CDP 端口），再 node scripts/e2e-agent.mjs PORT
 */
import http from "node:http";
import { chromium } from "@playwright/test";

const PORT = process.argv[2] || "22111";
const MOCK_PORT = Number(process.argv[3] || 23111);

/** mock 模型：第一轮返回 tool_call，第二轮返回最终文本。 */
let turn = 0;
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const payload = JSON.parse(body || "{}");
    const isSecond = Array.isArray(payload.messages)
      ? payload.messages.some((m) => m.role === "tool")
      : false;
    turn += 1;
    const reply = isSecond
      ? {
          choices: [
            {
              message: { role: "assistant", content: `工具结果已收到（第 ${turn} 轮）` },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }
      : {
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call-e2e-1",
                    type: "function",
                    function: {
                      // 必须选 Mutate/Dangerous 级的工具：Read 级工具会
                      // 直接执行、不产生审批（这是设计，不是 bug）。
                      name: "create_task",
                      arguments: JSON.stringify({ title: "E2E approval probe" }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 10 },
        };
    const out = JSON.stringify(reply);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(out);
  });
});

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
const ok = (msg) => console.log(`ok   ${msg}`);

async function main() {
  await new Promise((r) => server.listen(MOCK_PORT, "127.0.0.1", r));
  console.log(`mock model on :${MOCK_PORT}`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  const p = ctx.pages()[0] || (await ctx.newPage());

  if (!(await p.evaluate(() => "__TAURI_INTERNALS__" in window))) {
    fail("当前不是 Tauri 环境");
  }
  ok("运行在真实 Tauri 窗口内");

  // 配置 provider：密钥只进内存，get 只回布尔
  const configured = await p.evaluate(async (port) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    await invoke("agent_set_provider", {
      config: {
        base_url: `http://127.0.0.1:${port}`,
        model: "mock-model",
        api_key: "sk-e2e-not-a-real-key",
        temperature: 0.1,
        max_tokens: 256,
        fallbacks: [],
      },
    });
    return invoke("agent_get_provider");
  }, MOCK_PORT);
  if (!configured.has_key) fail("provider 配置后 has_key 仍为 false");
  if (JSON.stringify(configured).includes("sk-e2e")) {
    fail("get_provider 回显了密钥");
  }
  ok("provider 配置成功，密钥不回显");

  // 一条消息 → 模型要求调用工具 → 必须进入待审批
  const run1 = await p.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    return invoke("agent_run", {
      messages: [{ role: "user", content: "看看有哪些进程" }],
    });
  });
  const pending = (run1.steps || []).filter((s) => s.needs_approval && s.call_id);
  if (pending.length === 0) {
    fail(`没有产生待审批步骤：${JSON.stringify(run1).slice(0, 300)}`);
  }
  ok(`模型请求工具 ${pending[0].tool}，进入待审批（call_id=${pending[0].call_id}）`);

  // 批准 → 工具真的执行
  const approved = await p.evaluate(async (callId) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    return invoke("agent_approve_tool", { callId });
  }, pending[0].call_id);
  if (!approved.ok) fail(`批准后工具执行失败：${approved.error}`);
  if (!approved.content || approved.content.length < 2) {
    fail("批准后工具没有返回内容");
  }
  ok(`批准后工具执行成功（返回 ${approved.content.length} 字符）`);

  // 批准确实产生了副作用：任务出现在看板上
  const hasTask = await p.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const data = await invoke("load_data");
    return data.tasks.some((x) => x.title === "E2E approval probe");
  });
  if (!hasTask) fail("批准后任务没有真的写进 data.json");
  ok("批准后副作用真实落盘（任务出现在 data.json）");

  // 同一 token 再用一次必须被拒（不可重放）
  const replay = await p.evaluate(async (callId) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    try {
      await invoke("agent_approve_tool", { callId });
      return { rejected: false };
    } catch (e) {
      return { rejected: true, message: String(e) };
    }
  }, pending[0].call_id);
  if (!replay.rejected) fail("同一审批 token 被重放了");
  ok(`审批 token 不可重放：${replay.message.slice(0, 40)}`);

  // 第二轮：把工具结果回传，模型给最终文本
  const run2 = await p.evaluate(async (content) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    return invoke("agent_run", {
      messages: [
        { role: "user", content: "看看有哪些进程" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-e2e-1",
              type: "function",
              function: {
                name: "create_task",
                arguments: '{"title":"E2E approval probe"}',
              },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-e2e-1", content },
      ],
    });
  }, approved.content);
  if (!run2.answer || run2.answer.length === 0) fail("第二轮没有返回文本");
  ok(`工具结果回传后模型给出总结：${run2.answer.slice(0, 30)}`);

  // 清空对话：后端待批记录一并撤销
  await p.evaluate(async () => {
    await window.__TAURI_INTERNALS__.invoke("agent_clear_chat");
  });
  ok("agent_clear_chat 可调用");

  // 清掉测试写进真实数据里的探针任务，避免污染用户数据
  const cleaned = await p.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const data = await invoke("load_data");
    const before = data.tasks.length;
    data.tasks = data.tasks.filter((x) => x.title !== "E2E approval probe");
    await invoke("save_data", { data });
    const after = await invoke("load_data");
    return { removed: before - after.tasks.length, left: after.tasks.length };
  });
  ok(`测试数据已清理（移除 ${cleaned.removed} 条探针任务，剩余 ${cleaned.left} 条）`);

  await browser.close();
  server.close();
  console.log("\n全部通过（Agent 全链路：真实 IPC + mock 模型）");
}

main().catch((e) => {
  console.error(e.message || e);
  server.close();
  process.exit(1);
});
