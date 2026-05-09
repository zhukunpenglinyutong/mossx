import type { ClientDocumentationNode } from "../clientDocumentationTypes";
import type { ClientDocumentationIconComponent } from "./clientDocumentationIcons";
import { getClientDocumentationIconComponent } from "./clientDocumentationIcons";

type ClientDocumentationTreeProps = {
  nodes: ClientDocumentationNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

export function ClientDocumentationTree({
  nodes,
  selectedNodeId,
  onSelectNode,
}: ClientDocumentationTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="client-documentation-tree-empty">
        暂无客户端说明文档目录。
      </div>
    );
  }

  return (
    <nav className="client-documentation-tree" aria-label="客户端说明文档目录">
      {nodes.map((node) => (
        <div className="client-documentation-tree-group" key={node.id}>
          <TopLevelTreeNode
            node={node}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
          {node.children && node.children.length > 0 ? (
            <div className="client-documentation-tree-children">
              {node.children.map((child) => (
                <button
                  type="button"
                  className={`client-documentation-tree-node is-child${
                    selectedNodeId === child.id ? " is-active" : ""
                  }`}
                  key={child.id}
                  onClick={() => onSelectNode(child.id)}
                >
                  <span className="client-documentation-tree-title">{child.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

type TopLevelTreeNodeProps = {
  node: ClientDocumentationNode;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

function TopLevelTreeNode({
  node,
  selectedNodeId,
  onSelectNode,
}: TopLevelTreeNodeProps) {
  const Icon: ClientDocumentationIconComponent = getClientDocumentationIconComponent(
    node.iconKey,
  );

  return (
    <button
      type="button"
      className={`client-documentation-tree-node is-top-level${
        selectedNodeId === node.id ? " is-active" : ""
      }`}
      onClick={() => onSelectNode(node.id)}
    >
      <span className="client-documentation-tree-node-main">
        <span className="client-documentation-tree-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={2.1} />
        </span>
        <span className="client-documentation-tree-copy">
          <span className="client-documentation-tree-title">{node.title}</span>
          <span className="client-documentation-tree-summary">{node.summary}</span>
        </span>
        <span className="client-documentation-tree-count">
          {node.children?.length ?? 0}
        </span>
      </span>
    </button>
  );
}
