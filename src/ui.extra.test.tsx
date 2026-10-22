import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ConfirmDialog,
  Empty,
  ErrorState,
  Modal,
  Skeleton,
  SkeletonCard,
  Spinner,
  StatCard,
  Table,
  Td,
  Tr,
} from "./ui";
import { Cpu } from "lucide-react";

/**
 * 补测「状态类」原语。
 *
 * 这些组件在页面里承担「后端失败时用户看到什么」，是审计里 P1 项的直接
 * 实现；没有断言的话，最容易发生的回归是把 role/重试按钮删掉而没人发现
 * （界面看起来仍然是一块红字）。
 */
describe("ErrorState", () => {
  it("有 role=alert，重试按钮可点", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState onRetry={onRetry} retryLabel="重试">
        读取失败
      </ErrorState>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("读取失败");
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("不给 onRetry 时不渲染按钮", () => {
    render(<ErrorState>出错了</ErrorState>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("默认三行，且对辅助技术隐藏", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll('[style*="width"]')).toHaveLength(3);
  });

  it("行数可指定，宽度按行递减", () => {
    const { container } = render(<Skeleton lines={2} />);
    const bars = [...container.querySelectorAll<HTMLElement>('[style*="width"]')];
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("82%");
  });

  it("SkeletonCard 渲染标题条与内容行", () => {
    const { container } = render(<SkeletonCard rows={2} />);
    expect(container.querySelector(".t-card")).toBeInTheDocument();
    // 标题条 + 2 行内容条 = 3 个带宽度样式的块
    expect(container.querySelectorAll('[style*="width"], .w-24')).toHaveLength(3);
  });
});

describe("Empty 的 action", () => {
  it("有操作时渲染按钮", async () => {
    const onClick = vi.fn();
    render(<Empty action={<button onClick={onClick}>新建</button>}>还没有内容</Empty>);
    await userEvent.click(screen.getByRole("button", { name: "新建" }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe("ConfirmDialog", () => {
  it("确认与取消分别回调", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="确认恢复"
        body="会覆盖当前数据"
        confirmLabel="恢复"
        cancelLabel="取消"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "恢复" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("非危险模式没有警告图标但仍可确认", async () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        danger={false}
        title="提示"
        body="正文"
        confirmLabel="好的"
        cancelLabel="关闭"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    // 非危险模式不画警告图标（危险色块只属于 danger 分支）
    expect(container.querySelector(".text-danger")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "好的" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("统计与表格补充", () => {
  it("StatCard 无 tone 时用正文色", () => {
    render(<StatCard icon={Cpu} label="合计" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("Table 空 head 也能渲染行", () => {
    render(
      <Table head={[]}>
        <Tr>
          <Td>只有内容</Td>
        </Tr>
      </Table>
    );
    expect(screen.getByText("只有内容")).toBeInTheDocument();
  });

  it("Spinner 带旋转动画类", () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild?.className).toContain("animate-spin");
  });
});

/**
 * 焦点陷阱的两个边界：Shift+Tab 从首元素回绕到末元素；Esc 在对话框内关闭。
 * 这两条决定「键盘用户能不能逃出去 / 能不能关掉」，删掉不会有任何视觉变化。
 */
describe("Modal 键盘边界", () => {
  it("Shift+Tab 在首元素回绕到末元素", async () => {
    render(
      <Modal
        open
        title="t"
        onClose={() => {}}
        footer={<button type="button">末按钮</button>}
      >
        <input aria-label="首输入" />
      </Modal>
    );
    const first = screen.getByLabelText("首输入");
    first.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "末按钮" }));
  });

  it("Tab 在末元素回绕到首元素", async () => {
    render(
      <Modal
        open
        title="t"
        onClose={() => {}}
        footer={<button type="button">末按钮</button>}
      >
        <input aria-label="首输入" />
      </Modal>
    );
    const last = screen.getByRole("button", { name: "末按钮" });
    last.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("首输入"));
  });

  it("对话框内按 Esc 触发关闭", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="t" onClose={onClose}>
        <input aria-label="输入" />
      </Modal>
    );
    screen.getByLabelText("输入").focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("没有可聚焦元素时 Tab 不抛错", async () => {
    render(
      <Modal open title="t" onClose={() => {}}>
        <p>纯文字</p>
      </Modal>
    );
    await userEvent.tab();
    expect(screen.getByText("纯文字")).toBeInTheDocument();
  });
});
