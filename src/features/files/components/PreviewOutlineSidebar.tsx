import type { PreviewOutlineItem } from "../utils/filePreviewOutline";

type PreviewOutlineSidebarProps = {
  title: string;
  emptyLabel: string;
  items: PreviewOutlineItem[];
  activeItemId: string | null;
  onSelectItem: (item: PreviewOutlineItem) => void;
};

type PreviewOutlineEntryProps = {
  item: PreviewOutlineItem;
  depth: number;
  activeItemId: string | null;
  onSelectItem: (item: PreviewOutlineItem) => void;
};

function PreviewOutlineEntry({
  item,
  depth,
  activeItemId,
  onSelectItem,
}: PreviewOutlineEntryProps) {
  const isActive = activeItemId === item.id;

  return (
    <li className="fvp-preview-outline-entry">
      <button
        type="button"
        className={`fvp-preview-outline-button${isActive ? " is-active" : ""}`}
        style={{ paddingInlineStart: `${12 + depth * 14}px` }}
        aria-current={isActive ? "location" : undefined}
        onClick={() => onSelectItem(item)}
      >
        {item.title}
      </button>
      {item.children.length > 0 ? (
        <ul className="fvp-preview-outline-list">
          {item.children.map((childItem) => (
            <PreviewOutlineEntry
              key={childItem.id}
              item={childItem}
              depth={depth + 1}
              activeItemId={activeItemId}
              onSelectItem={onSelectItem}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PreviewOutlineSidebar({
  title,
  emptyLabel,
  items,
  activeItemId,
  onSelectItem,
}: PreviewOutlineSidebarProps) {
  return (
    <nav className="fvp-preview-outline" aria-label={title}>
      <header className="fvp-preview-section-header">
        <strong>{title}</strong>
      </header>
      {items.length > 0 ? (
        <ul className="fvp-preview-outline-list">
          {items.map((item) => (
            <PreviewOutlineEntry
              key={item.id}
              item={item}
              depth={0}
              activeItemId={activeItemId}
              onSelectItem={onSelectItem}
            />
          ))}
        </ul>
      ) : (
        <div className="fvp-preview-outline-empty">{emptyLabel}</div>
      )}
    </nav>
  );
}
