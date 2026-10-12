import { describe, expect, it, vi } from "vitest";
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
});
