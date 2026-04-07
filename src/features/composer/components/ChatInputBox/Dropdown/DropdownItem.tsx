import { useTranslation } from 'react-i18next';
import type { DropdownItemProps } from '../types';
import { sanitizeSvg } from '../utils/sanitize';

/**
 * DropdownItem - Dropdown menu item component
 */
export const DropdownItem = ({
  item,
  isActive = false,
  onClick,
  onMouseEnter,
}: DropdownItemProps) => {
  const { t } = useTranslation();
  const scopeLabel = (() => {
    const data = item.data as Record<string, unknown> | undefined;
    const raw = data?.scopeLabel;
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
  })();
  const dropdownData = (item.data ?? {}) as Record<string, unknown>;
  const promptKind =
    typeof dropdownData.promptKind === 'string' ? dropdownData.promptKind : null;
  const promptHeatLevel =
    typeof dropdownData.heatLevel === 'number' ? dropdownData.heatLevel : 0;
  const promptUsageCount =
    typeof dropdownData.usageCount === 'number' ? dropdownData.usageCount : 0;
  const promptArgumentHint =
    typeof dropdownData.argumentHint === 'string' ? dropdownData.argumentHint.trim() : '';
  const promptArgumentHintLabel =
    typeof dropdownData.argumentHintLabel === 'string'
      ? dropdownData.argumentHintLabel.trim()
      : t('settings.prompt.argumentHintLabel');
  const isPromptItem = item.type === 'prompt' && promptKind === 'prompt';
  const isPromptCreateItem = item.type === 'prompt' && promptKind === 'create';
  const promptHeatLabel =
    promptUsageCount > 0
      ? t('settings.prompt.usageCount', { count: promptUsageCount })
      : t('settings.prompt.newPromptBadge');
  const promptBadges = [
    scopeLabel,
    promptArgumentHint ? `${promptArgumentHintLabel}: ${promptArgumentHint}` : '',
  ].filter(Boolean);

  /**
   * Render icon
   */
  const renderIcon = () => {
    // If icon contains SVG tags, it's an inline SVG
    if (item.icon?.startsWith('<svg')) {
      return (
        <span
          className="dropdown-item-icon"
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(item.icon) }}
          style={{
            width: 16,
            height: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        />
      );
    }

    // Otherwise use codicon class name
    const iconClass = item.icon || getDefaultIconClass(item.type);
    return (
      <span
        className={`dropdown-item-icon codicon ${iconClass}`}
        data-heat-level={isPromptItem ? String(promptHeatLevel) : undefined}
      />
    );
  };

  /**
   * Get default icon class name (for codicon)
   */
  const getDefaultIconClass = (type?: string): string => {
    switch (type) {
      case 'file':
        return 'codicon-file';
      case 'directory':
        return 'codicon-folder';
      case 'command':
        return 'codicon-terminal';
      default:
        return 'codicon-symbol-misc';
    }
  };

  // Separator
  if (item.type === 'separator') {
    return <div className="dropdown-separator" />;
  }

  // Section header
  if (item.type === 'section-header') {
    return (
      <div className="dropdown-section-header">
        {item.label}
      </div>
    );
  }

  // All items are selectable (except loading indicator items)
  const isDisabled = item.id === '__loading__';

  return (
    <div
      className={`dropdown-item ${item.className ?? ''} ${isPromptItem ? 'dropdown-item--prompt' : ''} ${isPromptCreateItem ? 'dropdown-item--prompt-create' : ''} ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => {
        // Call the original onMouseEnter (for keyboard navigation highlighting)
        onMouseEnter?.();
      }}
      style={isDisabled ? { cursor: 'default' } : undefined}
    >
      {renderIcon()}
      <div className="dropdown-item-content">
        {isPromptItem ? (
          <>
            <div className="dropdown-item-row dropdown-item-row--primary">
              <div className="dropdown-item-label">{item.label}</div>
              <div className="dropdown-item-meta">
                <span className="dropdown-item-heat">{promptHeatLabel}</span>
              </div>
            </div>
            {item.description ? (
              <div className="dropdown-item-row dropdown-item-row--secondary">
                <div className="dropdown-item-description">{item.description}</div>
              </div>
            ) : null}
            {promptBadges.length > 0 ? (
              <div className="dropdown-item-row dropdown-item-row--meta">
                {promptBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`dropdown-item-badge${badge === scopeLabel ? ' dropdown-item-badge--scope' : ''}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="dropdown-item-label">{item.label}</div>
            {!item.description && scopeLabel && (
              <div className="dropdown-item-scope">{scopeLabel}</div>
            )}
            {item.description && (
              <div className="dropdown-item-description">{item.description}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DropdownItem;
