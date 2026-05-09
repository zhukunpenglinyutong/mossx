import type { ComponentType } from "react";
import Bell from "lucide-react/dist/esm/icons/bell";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import BrainCircuit from "lucide-react/dist/esm/icons/brain-circuit";
import Files from "lucide-react/dist/esm/icons/files";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import ListChecks from "lucide-react/dist/esm/icons/list-checks";
import MessageSquareText from "lucide-react/dist/esm/icons/message-square-text";
import NotebookPen from "lucide-react/dist/esm/icons/notebook-pen";
import PenLine from "lucide-react/dist/esm/icons/pen-line";
import Puzzle from "lucide-react/dist/esm/icons/puzzle";
import Search from "lucide-react/dist/esm/icons/search";
import Settings from "lucide-react/dist/esm/icons/settings";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal";
import TerminalSquare from "lucide-react/dist/esm/icons/terminal-square";
import type { LucideProps } from "lucide-react";
import type { ClientDocumentationIconKey } from "../clientDocumentationTypes";

export type ClientDocumentationIconComponent = ComponentType<LucideProps>;

const CLIENT_DOCUMENTATION_ICON_COMPONENTS: Record<
  ClientDocumentationIconKey,
  ClientDocumentationIconComponent
> = {
  workspace: FolderKanban,
  conversation: MessageSquareText,
  composer: PenLine,
  engine: BrainCircuit,
  runtime: TerminalSquare,
  files: Files,
  git: GitBranch,
  spec: BookOpen,
  memory: NotebookPen,
  tasks: ListChecks,
  search: Search,
  settings: Settings,
  extensions: Puzzle,
  notifications: Bell,
  ui: SlidersHorizontal,
};

export function getClientDocumentationIconComponent(
  iconKey: ClientDocumentationIconKey | undefined,
): ClientDocumentationIconComponent {
  return iconKey
    ? CLIENT_DOCUMENTATION_ICON_COMPONENTS[iconKey]
    : CLIENT_DOCUMENTATION_ICON_COMPONENTS.workspace;
}
