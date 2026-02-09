import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Copy from "lucide-react/dist/esm/icons/copy";
import Check from "lucide-react/dist/esm/icons/check";

const MEMORY_URL = "http://localhost:37777/";
const HEALTH_CHECK_INTERVAL = 10_000;

type Status = "checking" | "online" | "offline";

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be restricted
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={copyBtnStyle}
      title={copied ? t("messages.copied") : t("messages.copy")}
    >
      {copied ? (
        <>
          <Check size={12} style={{ color: "var(--text-success, #22c55e)" }} />
          <span style={copiedTextStyle}>{t("messages.copied")}</span>
        </>
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}

export function MemoryPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("checking");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await fetch(MEMORY_URL, { method: "HEAD", mode: "no-cors" });
        if (!cancelled) setStatus("online");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    };

    check();
    const timer = setInterval(check, HEALTH_CHECK_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (status === "checking") {
    return (
      <div style={containerStyle}>
        <p style={subtitleStyle}>{t("memory.checking")}</p>
      </div>
    );
  }

  if (status === "offline") {
    const steps = [
      { num: "1", text: t("memory.offlineStep1"), isCode: true },
      { num: "2", text: t("memory.offlineStep2"), isCode: true },
      { num: "3", text: t("memory.offlineStep3"), isCode: false },
      { num: "4", text: t("memory.offlineStep4"), isCode: false },
    ];

    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={titleStyle}>{t("memory.offlineTitle")}</p>
          <p style={descStyle}>{t("memory.offlineDesc")}</p>

          <p style={stepsLabelStyle}>{t("memory.offlineStepsTitle")}</p>
          <ol style={stepsListStyle}>
            {steps.map((step) => (
              <li key={step.num} style={stepItemStyle}>
                {step.isCode ? (
                  <span style={codeRowStyle}>
                    <code style={codeStyle}>{step.text}</code>
                    <CopyButton text={step.text} />
                  </span>
                ) : (
                  <span>{step.text}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={MEMORY_URL}
      title="Long-term Memory"
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--text-muted)",
};

const cardStyle: React.CSSProperties = {
  maxWidth: 520,
  width: "100%",
  padding: "32px 28px",
  borderRadius: 12,
  background: "var(--surface-card, rgba(255,255,255,0.04))",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
};

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "var(--text-stronger)",
  margin: "0 0 8px 0",
};

const descStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
  margin: "0 0 20px 0",
  whiteSpace: "pre-line",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted)",
  margin: 0,
};

const stepsLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-strong)",
  margin: "0 0 10px 0",
};

const stepsListStyle: React.CSSProperties = {
  margin: 0,
  padding: "0 0 0 20px",
  listStyleType: "decimal",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const stepItemStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const codeRowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const codeStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: "var(--font-mono, monospace)",
  background: "var(--surface-strong, rgba(255,255,255,0.06))",
  padding: "2px 6px",
  borderRadius: 4,
  color: "var(--text-strong)",
};

const copyBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  background: "none",
  border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
  borderRadius: 4,
  padding: "2px 6px",
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: 11,
  lineHeight: 1,
  flexShrink: 0,
};

const copiedTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-success, #22c55e)",
};
