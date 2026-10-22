import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Server,
  Terminal,
} from "lucide-react";
import { Badge, Btn } from "../../ui";
import { useStore } from "../../lib/store";
import { useT } from "../../lib/i18n";
import type { Tone } from "../../ui";
import type { DevServer } from "../../types";

const CONFIDENCE_TONE: Record<string, Tone> = {
  high: "ok",
  medium: "warn",
};

/**
 * 开发服务器列表：一行一个服务，展开看命令与 git 分支。
 *
 * 从 Servers 页面拆出来的原因：单张卡片 120 行 JSX 让页面的圈复杂度
 * 到 11（红线 10），而且这张卡自带展开状态与三个操作按钮，
 * 与页面上的端口表互不相关。
 */
export function DevServerList({ devs }: { devs: DevServer[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {devs.map((d) => (
        <DevServerCard
          key={`${d.port}-${d.pid}`}
          server={d}
          expanded={expanded === d.port}
          onToggle={() => setExpanded(expanded === d.port ? null : d.port)}
        />
      ))}
    </div>
  );
}

function DevServerCard({
  server: d,
  expanded,
  onToggle,
}: {
  server: DevServer;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const gitBranches = useStore((s) => s.gitBranches);
  const fetchGitBranch = useStore((s) => s.fetchGitBranch);
  const openTarget = useStore((s) => s.openTarget);
  const setKillTarget = useStore((s) => s.setKillTarget);
  const procs = useStore((s) => s.procs);
  const branch = d.project_dir ? gitBranches[d.project_dir] : undefined;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel2 transition-all">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accentsoft/30"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-accent" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-dim" />
        )}
        <Server size={16} className="shrink-0 text-ok" />
        <span className="font-semibold">{d.framework}</span>
        <Badge tone="ok">:{d.port}</Badge>
        <Badge tone={CONFIDENCE_TONE[d.confidence] ?? "dim"}>
          {t(`servers.confidence.${d.confidence}`)}
        </Badge>
        <span
          className="ml-auto hidden truncate font-mono text-xs text-dim md:block"
          title={d.project_dir ?? ""}
        >
          {d.project_dir ? d.project_dir : `PID ${d.pid}`}
        </span>
        <div className="ml-2 flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <Btn
            className="!px-2 !py-1 !text-xs"
            title={t("servers.openInBrowser")}
            onClick={() => openTarget(`http://localhost:${d.port}`)}
          >
            <ExternalLink size={12} />
          </Btn>
          {d.project_dir && (
            <Btn
              className="!px-2 !py-1 !text-xs"
              title={t("servers.openProjectDir")}
              onClick={() => d.project_dir && openTarget(d.project_dir)}
            >
              <FolderOpen size={12} />
            </Btn>
          )}
          <Btn
            variant="danger"
            className="!px-2 !py-1 !text-xs"
            title={t("servers.killProcess")}
            onClick={() => {
              const p = procs.find((x) => x.pid === d.pid);
              if (p) setKillTarget(p);
            }}
          >
            <Terminal size={12} />
          </Btn>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-line bg-panel/50 px-4 py-3 text-sm">
          <DetailRow label={t("servers.detail.process")}>
            <span className="font-mono">
              {d.process_name} · PID {d.pid}
            </span>
          </DetailRow>
          <DetailRow label={t("servers.detail.protocol")}>
            <Badge>{d.protocol}</Badge>
          </DetailRow>
          {d.project_dir && (
            <>
              <DetailRow label={t("servers.detail.projectDir")}>
                <span className="font-mono text-xs" title={d.project_dir}>
                  {d.project_dir}
                </span>
              </DetailRow>
              <DetailRow label={t("servers.detail.gitBranch")}>
                <BranchValue
                  branch={branch}
                  onFetch={() => void fetchGitBranch(d.project_dir!)}
                />
              </DetailRow>
            </>
          )}
          <DetailRow label={t("servers.detail.commandLine")}>
            <code className="block break-all rounded bg-bg px-2 py-1 text-[11px] text-dim">
              {d.cmd_line}
            </code>
          </DetailRow>
        </div>
      )}
    </div>
  );
}

/** 分支未知时给一个按需探测的按钮；已知（含空串=非 git 仓库）直接显示。 */
function BranchValue({
  branch,
  onFetch,
}: {
  branch: string | undefined;
  onFetch: () => void;
}) {
  const t = useT();
  if (branch === undefined) {
    return (
      <Btn className="!px-2 !py-0.5 !text-[10px]" onClick={onFetch}>
        <GitBranch size={10} />
      </Btn>
    );
  }
  return (
    <Badge tone="dim">
      <GitBranch size={10} className="mr-1 inline" />
      {branch || t("servers.notGitRepo")}
    </Badge>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-28 shrink-0 text-dim">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
