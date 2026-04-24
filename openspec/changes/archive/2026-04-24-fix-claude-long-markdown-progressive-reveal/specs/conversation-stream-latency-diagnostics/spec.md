## MODIFIED Requirements

### Requirement: Latency Diagnostics MUST Distinguish Upstream Delay From Client Render Amplification

系统 MUST 避免把所有“出字慢”都记录成同一种原因。

#### Scenario: upstream pending is classified without blaming renderer
- **WHEN** 会话长时间未收到首个 chunk，且 renderer 没有出现持续重渲染热点
- **THEN** 系统 MUST 将该次慢体验归类为 upstream pending、first-token delay 或等价类别
- **AND** 诊断 MUST NOT 错误归因为 client render amplification

#### Scenario: render amplification is classified after chunk ingress exists
- **WHEN** 会话已经收到 chunk，且 chunk cadence 正常，但可见文本更新明显滞后于 chunk 到达
- **THEN** 系统 MUST 将该次慢体验归类为 client render amplification、render pacing lag 或等价类别
- **AND** 诊断 MUST 保留相关节流/scroll/render 路径的证据摘要

#### Scenario: visible-output stall is classified after assistant text delta exists
- **WHEN** Claude 会话已经收到 assistant text delta
- **AND** 同一 live assistant item 的 visible text 在 bounded window 内不再增长
- **THEN** 系统 MUST 将该次慢体验归类为 `visible-output-stall-after-first-delta` 或等价类别
- **AND** 该分类 MUST NOT 依赖 provider/model 指纹
