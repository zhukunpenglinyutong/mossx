import type { ClientDocumentationNode } from "../clientDocumentationTypes";
import type { ClientDocumentationIconComponent } from "./clientDocumentationIcons";
import { getClientDocumentationIconComponent } from "./clientDocumentationIcons";

type ClientDocumentationDetailProps = {
  node: ClientDocumentationNode | null;
  missingNodeId?: string | null;
  onResetSelection: () => void;
};

function renderList(items: string[]) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function ClientDocumentationDetail({
  node,
  missingNodeId = null,
  onResetSelection,
}: ClientDocumentationDetailProps) {
  if (!node) {
    return (
      <section className="client-documentation-detail is-empty">
        <p className="client-documentation-eyebrow">Recoverable state</p>
        <h1>暂无可展示的说明文档</h1>
        <p>文档数据为空或当前节点不可用。请返回默认模块后继续阅读。</p>
        {missingNodeId ? (
          <p className="client-documentation-missing-node">
            未找到节点：<code>{missingNodeId}</code>
          </p>
        ) : null}
        <button type="button" className="primary" onClick={onResetSelection}>
          返回默认模块
        </button>
      </section>
    );
  }

  const Icon: ClientDocumentationIconComponent = getClientDocumentationIconComponent(
    node.iconKey,
  );
  const usageSteps = node.usageSteps ?? node.workflow ?? [];

  return (
    <article className="client-documentation-detail">
      <header className="client-documentation-hero">
        <div className="client-documentation-hero-icon" aria-hidden="true">
          <Icon size={30} strokeWidth={2} />
        </div>
        <div>
          <p className="client-documentation-eyebrow">Client module</p>
          <h1>{node.title}</h1>
          <p className="client-documentation-summary">{node.summary}</p>
        </div>
      </header>

      <div className="client-documentation-overview-grid">
        <section className="client-documentation-overview-card">
          <h2>模块定位</h2>
          <p>{node.purpose}</p>
        </section>

        <section className="client-documentation-overview-card">
          <h2>入口位置</h2>
          <p>{node.entry}</p>
        </section>
      </div>

      <section className="client-documentation-section">
        <h2>核心功能点</h2>
        <div className="client-documentation-feature-grid">
          {node.features.map((featureName) => (
            <span className="client-documentation-feature-chip" key={featureName}>
              {featureName}
            </span>
          ))}
        </div>
      </section>

      {usageSteps.length > 0 ? (
        <section className="client-documentation-section is-usage">
          <div className="client-documentation-section-heading">
            <h2>模块使用说明</h2>
            <span>{usageSteps.length} steps</span>
          </div>
          <ol className="client-documentation-usage-steps">
            {usageSteps.map((step, index) => (
              <li key={step}>
                <span className="client-documentation-step-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {node.workflow && node.workflow.length > 0 ? (
        <section className="client-documentation-section">
          <h2>典型使用流程</h2>
          <ol>
            {node.workflow.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="client-documentation-section">
        <h2>注意事项</h2>
        {renderList(node.notes)}
      </section>

      <section className="client-documentation-section">
        <h2>关联模块</h2>
        <div className="client-documentation-related-modules">
          {node.relatedModules.map((moduleName) => (
            <span className="client-documentation-related-module" key={moduleName}>
              {moduleName}
            </span>
          ))}
        </div>
      </section>
    </article>
  );
}
