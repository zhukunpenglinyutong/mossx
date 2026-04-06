import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShortcutAction } from '../types';

interface ShortcutActionsSelectProps {
  actions?: ShortcutAction[];
}

export const ShortcutActionsSelect = ({ actions }: ShortcutActionsSelectProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasActions = Boolean(actions && actions.length > 0);

  const handleToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!hasActions) {
      return;
    }
    setIsOpen((prev) => !prev);
  }, [hasActions]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!hasActions) {
    return null;
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        className="selector-button selector-shortcut-button"
        onClick={handleToggle}
        title={t('chat.shortcutActionsEntry')}
        aria-label={t('chat.shortcutActionsEntry')}
      >
        <span className="codicon codicon-zap" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="selector-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            zIndex: 10000,
            minWidth: '220px',
          }}
        >
          {actions?.map((action) => (
            <div
              key={action.key}
              className="selector-option selector-option-shortcut"
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
                setIsOpen(false);
              }}
            >
              <span className="selector-shortcut-trigger">{action.trigger}</span>
              <span>{action.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShortcutActionsSelect;
