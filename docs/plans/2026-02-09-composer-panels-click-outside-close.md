# 管理面板下拉弹窗点击外部关闭（执行报告）

**创建日期**: 2026-02-09  
**最后更新**: 2026-02-09  
**状态**: ✅ 已完成（Ready for PR）

---

## 1. 目标与结论

目标：为管理面板 3 个下拉弹窗提供“点击外部关闭”。  
结论：已完成。三个弹窗均通过透明 backdrop 捕获外部点击并关闭，原有按钮切换、搜索与选择逻辑保持不变。

---

## 2. 实际改动

### 2.1 组件层

为以下 3 个菜单在 `open` 时增加 backdrop：

1. 帮助说明（`helpMenuOpen`）
2. Skill 选择（`skillMenuOpen`）
3. Commons 选择（`commonsMenuOpen`）

实现方式：
- 条件渲染 `<>...</>`
- 先渲染 `div.composer-context-backdrop`
- `onClick` 分别触发 `setHelpMenuOpen(false)` / `setSkillMenuOpen(false)` / `setCommonsMenuOpen(false)`

Refers to:
- `src/features/composer/components/Composer.tsx`

### 2.2 样式层

新增 backdrop 样式并确认层级：
- `position: fixed; inset: 0; z-index: 1190; background: transparent;`
- 菜单面板保持 `z-index: 1200`

Refers to:
- `src/styles/composer.css`

---

## 3. 验证记录

### 3.1 类型检查

已执行：
```bash
npm run typecheck
```

结果：通过（无 TypeScript 错误）。

### 3.2 交互核对点

- [x] 点击按钮可打开/关闭对应弹窗
- [x] 点击弹窗外部可关闭对应弹窗
- [x] Skill/Commons 搜索输入与筛选功能不受影响
- [x] 三个弹窗互斥逻辑不受影响（打开一个会关闭其他）

---

## 4. 验收清单

- [x] 三个弹窗均支持 click-outside close
- [x] 无新增引擎/数据层副作用
- [x] Typecheck 通过

---

## 5. 备注（本计划外）

- 对看板 icon 的亮度微调已单独处理为“仅选中态变绿”，未影响本计划核心功能。

---

## 6. PR 说明建议（可直接用）

- 为 Composer 管理面板三个下拉菜单增加统一的 click-outside-to-close 行为。
- 采用 backdrop 方案，改动范围小、风险低，交互一致性提升。
