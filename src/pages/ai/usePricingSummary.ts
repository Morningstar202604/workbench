import { useCallback, useEffect, useState } from "react";
import { getPricing, isTauri } from "../../lib/api";

// 供成本页显示「已覆盖 N 个型号」的小角标。
export function usePricingSummary() {
  const [count, setCount] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const v = await getPricing();
      setCount(v.rows.filter((r) => r.override_input !== null).length);
    } catch {
      setCount(null);
    }
  }, []);
  useEffect(() => {
    // setState 落在 await 之后；这条规则把「effect 调用会 setState 的异步函数」
    // 也标成级联渲染风险，实际不在同步渲染路径上。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 见上
    void refresh();
  }, [refresh]);
  return { count, refresh };
}
