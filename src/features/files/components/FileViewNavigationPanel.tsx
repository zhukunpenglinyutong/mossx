import type { LspLocationLike } from "../utils/fileViewNavigationUtils";
import { relativePathFromFileUri } from "../utils/fileViewNavigationUtils";

type FileViewNavigationPanelProps = {
  workspacePath: string;
  navigationError: string | null;
  definitionCandidates: LspLocationLike[];
  onCloseDefinitionCandidates: () => void;
  referenceResults: LspLocationLike[] | null;
  onCloseReferenceResults: () => void;
  onNavigateToLocation: (location: LspLocationLike) => void;
  t: (key: string) => string;
};

export function FileViewNavigationPanel({
  workspacePath,
  navigationError,
  definitionCandidates,
  onCloseDefinitionCandidates,
  referenceResults,
  onCloseReferenceResults,
  onNavigateToLocation,
  t,
}: FileViewNavigationPanelProps) {
  const hasDefinitionCandidates = definitionCandidates.length > 0;
  const hasReferenceResults = referenceResults !== null;
  if (!navigationError && !hasDefinitionCandidates && !hasReferenceResults) {
    return null;
  }

  return (
    <div className="fvp-navigation-panel">
      {navigationError ? (
        <div className="fvp-navigation-error">{navigationError}</div>
      ) : null}
      {hasDefinitionCandidates ? (
        <div className="fvp-navigation-section">
          <div className="fvp-navigation-header">
            <span>{t("files.definitionCandidates")}</span>
            <button
              type="button"
              className="ghost fvp-navigation-close"
              onClick={onCloseDefinitionCandidates}
            >
              {t("common.close")}
            </button>
          </div>
          <ul className="fvp-navigation-list">
            {definitionCandidates.map((location, index) => {
              const relativePath = relativePathFromFileUri(location.uri, workspacePath);
              const path = relativePath || location.uri;
              return (
                <li key={`${location.uri}-${location.line}-${location.character}-${index}`}>
                  <button
                    type="button"
                    className="fvp-navigation-item"
                    onClick={() => onNavigateToLocation(location)}
                  >
                    <span className="fvp-navigation-path" title={path}>
                      {path}
                    </span>
                    <span className="fvp-navigation-line">
                      L{location.line + 1}:C{location.character + 1}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {hasReferenceResults ? (
        <div className="fvp-navigation-section">
          <div className="fvp-navigation-header">
            <span>{t("files.referenceResults")}</span>
            <button
              type="button"
              className="ghost fvp-navigation-close"
              onClick={onCloseReferenceResults}
            >
              {t("common.close")}
            </button>
          </div>
          {referenceResults && referenceResults.length > 0 ? (
            <ul className="fvp-navigation-list">
              {referenceResults.map((location, index) => {
                const relativePath = relativePathFromFileUri(location.uri, workspacePath);
                const path = relativePath || location.uri;
                return (
                  <li key={`${location.uri}-${location.line}-${location.character}-${index}`}>
                    <button
                      type="button"
                      className="fvp-navigation-item"
                      onClick={() => onNavigateToLocation(location)}
                    >
                      <span className="fvp-navigation-path" title={path}>
                        {path}
                      </span>
                      <span className="fvp-navigation-line">
                        L{location.line + 1}:C{location.character + 1}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="fvp-navigation-empty">{t("files.noReferencesFound")}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
