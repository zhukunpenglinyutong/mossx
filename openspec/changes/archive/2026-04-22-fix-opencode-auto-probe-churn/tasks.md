## 1. OpenSpec + task framing

- [x] 1.1 完成 `fix-opencode-auto-probe-churn` 的 proposal/design/specs/tasks，明确 OpenCode readiness 改为 manual refresh-only。
- [x] 1.2 在 `.trellis/tasks/04-22-fix-opencode-auto-probe-churn/` 写入本次修复 PRD，并保持 change/task 绑定清晰。

## 2. Frontend behavior change

- [x] 2.1 修改 `useSidebarMenus.ts`，移除 workspace menu 打开与菜单常驻期间的 OpenCode 自动 provider-health probe。
- [x] 2.2 修改 `useEngineController.ts`，移除默认/自动 OpenCode provider-health 探测，并提供 engine-scoped model refresh 路径。
- [x] 2.3 修改 `app-shell.tsx`，把 Claude pending thread 的模型刷新从 all-engine refresh 改成 Claude-only refresh。
- [x] 2.4 修改 `useSidebarMenus.ts` 与 `Sidebar.tsx`，让工作区菜单 refresh 在不关闭弹层的前提下直接消费 refresh result，并只在这条显式路径上补做 OpenCode login probe。

## 3. Verification

- [x] 3.1 更新 sidebar menu / engine controller / Sidebar 相关测试，覆盖“菜单打开不自动探测，手动 refresh 才探测，且 refresh 结果可在当前菜单中直接回显”。
- [x] 3.2 运行 targeted tests 与 frontend quality gates，确认无行为回退。
