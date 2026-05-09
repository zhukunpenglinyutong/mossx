import {
  CLIENT_DOCUMENTATION_REQUIRED_UI_CONTROL_IDS,
  CLIENT_DOCUMENTATION_REQUIRED_MODULE_IDS,
  CLIENT_DOCUMENTATION_TREE,
} from "./clientDocumentationData";
import type { ClientDocumentationNode } from "./clientDocumentationTypes";

const SAFE_CLIENT_DOCUMENTATION_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateClientDocumentationKey(value: string): boolean {
  return SAFE_CLIENT_DOCUMENTATION_KEY_PATTERN.test(value);
}

export function flattenClientDocumentationNodes(
  nodes: ClientDocumentationNode[] = CLIENT_DOCUMENTATION_TREE,
): ClientDocumentationNode[] {
  const flattened: ClientDocumentationNode[] = [];
  const visit = (node: ClientDocumentationNode) => {
    flattened.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const node of nodes) {
    visit(node);
  }
  return flattened;
}

export function findClientDocumentationNode(
  nodeId: string | null,
  nodes: ClientDocumentationNode[] = CLIENT_DOCUMENTATION_TREE,
): ClientDocumentationNode | null {
  if (!nodeId) {
    return null;
  }
  return flattenClientDocumentationNodes(nodes).find((node) => node.id === nodeId) ?? null;
}

export function getDefaultClientDocumentationNode(
  nodes: ClientDocumentationNode[] = CLIENT_DOCUMENTATION_TREE,
): ClientDocumentationNode | null {
  return nodes[0] ?? null;
}

export function getSelectableClientDocumentationNode(
  nodeId: string | null,
  nodes: ClientDocumentationNode[] = CLIENT_DOCUMENTATION_TREE,
): ClientDocumentationNode | null {
  return findClientDocumentationNode(nodeId, nodes) ?? getDefaultClientDocumentationNode(nodes);
}

export function getClientDocumentationContentIssues(
  nodes: ClientDocumentationNode[] = CLIENT_DOCUMENTATION_TREE,
): string[] {
  const issues: string[] = [];
  const topLevelIds = new Set(nodes.map((node) => node.id));
  for (const requiredId of CLIENT_DOCUMENTATION_REQUIRED_MODULE_IDS) {
    if (!topLevelIds.has(requiredId)) {
      issues.push(`missing required module: ${requiredId}`);
    }
  }
  for (const node of flattenClientDocumentationNodes(nodes)) {
    if (!validateClientDocumentationKey(node.id)) {
      issues.push(`unsafe node id: ${node.id}`);
    }
    if (!node.purpose.trim()) {
      issues.push(`missing purpose: ${node.id}`);
    }
    if (!node.entry.trim()) {
      issues.push(`missing entry: ${node.id}`);
    }
    if (node.features.length === 0) {
      issues.push(`missing features: ${node.id}`);
    }
    if (node.children && !node.iconKey) {
      issues.push(`missing module icon: ${node.id}`);
    }
    if (node.children && (node.usageSteps?.length ?? 0) < 6) {
      issues.push(`top-level module needs detailed usage steps: ${node.id}`);
    }
    if (node.notes.length === 0) {
      issues.push(`missing notes: ${node.id}`);
    }
    if (node.relatedModules.length === 0) {
      issues.push(`missing related modules: ${node.id}`);
    }
  }
  const documentedControlIds = new Set(
    flattenClientDocumentationNodes(nodes)
      .map((node) => node.uiControlId)
      .filter((controlId): controlId is string => Boolean(controlId)),
  );
  for (const controlId of CLIENT_DOCUMENTATION_REQUIRED_UI_CONTROL_IDS) {
    if (!documentedControlIds.has(controlId)) {
      issues.push(`missing UI control documentation: ${controlId}`);
    }
  }
  for (const node of nodes) {
    if ((node.children?.length ?? 0) < 2) {
      issues.push(`top-level module needs at least two children: ${node.id}`);
    }
  }
  return issues;
}
