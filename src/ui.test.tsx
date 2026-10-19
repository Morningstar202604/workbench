import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Cpu } from "lucide-react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Modal,
  SectionTitle,
  Spinner,
  StatCard,
  Table,
  Td,
  Tr,
} from "./ui";

describe("Btn", () => {
  it("点击触发回调", async () => {
    const onClick = vi.fn();
    render(<Btn onClick={onClick}>点我</Btn>);
    await userEvent.click(screen.getByRole("button", { name: "点我" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled 时不可点", async () => {
    const onClick = vi.fn();
    render(
      <Btn onClick={onClick} disabled>
        禁用
      </Btn>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("danger 变体应用对应样式", () => {
    render(<Btn variant="danger">删除</Btn>);
    expect(screen.getByRole("button").className).toContain("danger");
  });
});

describe("Badge / Card / SectionTitle / Field / Empty / Spinner", () => {
  it("Badge 默认 dim 色调，未知 tone 回退 dim", () => {
    render(<Badge>x</Badge>);
    expect(screen.getByText("x").className).toContain("dim");
  });
  it("Card 渲染 children", () => {
    render(
      <Card>
        <span>内容</span>
      </Card>
    );
    expect(screen.getByText("内容")).toBeInTheDocument();
  });
  it("SectionTitle 渲染 extra 节点", () => {
    render(<SectionTitle extra={<b>附加</b>}>标题</SectionTitle>);
    expect(screen.getByText("标题")).toBeInTheDocument();
    expect(screen.getByText("附加")).toBeInTheDocument();
  });
  it("Field 关联 label 文案", () => {
    render(
      <Field label="用户名">
        <input />
      </Field>
    );
    expect(screen.getByText("用户名")).toBeInTheDocument();
  });
  it("Empty 无图标也能渲染", () => {
    render(<Empty>暂无数据</Empty>);
    expect(screen.getByText("暂无数据")).toBeInTheDocument();
  });
  it("Spinner 是 inline 元素", () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector("span")).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("数值直接显示并带色调", () => {
    render(<StatCard icon={Cpu} label="进程" value={42} tone="accent" />);
    expect(screen.getByText("进程")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
  it("字符串值原样显示", () => {
    render(<StatCard icon={Cpu} label="内存" value="3.2 GB" />);
    expect(screen.getByText("3.2 GB")).toBeInTheDocument();
  });
});

describe("Table / Td / Tr", () => {
  it("表头与单元格渲染", () => {
    render(
      <Table head={["A", "B"]}>
        <Tr>
          <Td>1</Td>
          <Td mono>2</Td>
        </Tr>
      </Table>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("open=false 不渲染", () => {
    render(
      <Modal open={false} title="t" onClose={() => {}}>
        body
      </Modal>
    );
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("open=true 渲染，点遮罩与 Esc 关闭", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="标题" onClose={onClose}>
        内容
      </Modal>
    );
    expect(screen.getByText("内容")).toBeInTheDocument();
    // 点遮罩（外层）
    await userEvent.click(document.querySelector(".fixed.inset-0")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点内容区不触发关闭", async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="标题" onClose={onClose}>
        内容
      </Modal>
    );
    await userEvent.click(screen.getByText("内容"));
    expect(onClose).not.toHaveBeenCalled();
  });

  // 回归：焦点陷阱原先只在焦点恰好位于首/尾元素时拦截。用户在对话框里
  // 点一下不可聚焦的正文，activeElement 会回到 body，下一次 Tab 就按文档
  // 顺序跑到遮罩背后的页面上（aria-modal 不产生任何浏览器级约束）。
  it("焦点在对话框外时，Tab 会被收回对话框内", async () => {
    render(
      <>
        <button type="button">外部按钮</button>
        <Modal
          open
          title="确认"
          onClose={() => {}}
          footer={
            <>
              <button type="button">取消</button>
              <button type="button">确认</button>
            </>
          }
        >
          正文
        </Modal>
      </>
    );

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "取消" }));

    // 模拟「点了不可聚焦的正文」：焦点回到 body
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "取消" }));
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "外部按钮" })
    );
  });

  it("关闭后焦点回到触发按钮", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            打开
          </button>
          <Modal open={open} title="t" onClose={() => setOpen(false)}>
            内容
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "打开" });
    trigger.focus();
    await userEvent.click(trigger);
    expect(screen.getByText("内容")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });
});
