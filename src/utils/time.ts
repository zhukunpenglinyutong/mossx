import i18n from "../i18n";

export function formatRelativeTime(timestamp: number) {
  const now = Date.now();
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 5) {
    return i18n.t("time.now");
  }
  if (absSeconds < 60) {
    const value = Math.max(1, Math.round(absSeconds));
    return diffSeconds < 0
      ? i18n.t("time.shortSecondsAgo", { value })
      : i18n.t("time.shortSecondsIn", { value });
  }
  if (absSeconds < 60 * 60) {
    const value = Math.max(1, Math.round(absSeconds / 60));
    return diffSeconds < 0
      ? i18n.t("time.shortMinutesAgo", { value })
      : i18n.t("time.shortMinutesIn", { value });
  }
  const ranges: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "week", seconds: 60 * 60 * 24 * 7 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 },
  ];
  const range =
    ranges.find((entry) => absSeconds >= entry.seconds) ||
    ranges[ranges.length - 1];
  if (!range) {
    return i18n.t("time.now");
  }
  const value = Math.round(diffSeconds / range.seconds);
  const formatter = new Intl.RelativeTimeFormat(i18n.language, {
    numeric: "auto",
  });
  return formatter.format(value, range.unit);
}

export function formatRelativeTimeShort(timestamp: number) {
  const now = Date.now();
  const absSeconds = Math.abs(Math.round((timestamp - now) / 1000));
  if (absSeconds < 60) {
    return i18n.t("time.now");
  }
  if (absSeconds < 60 * 60) {
    return i18n.t("time.shortMinutes", {
      value: Math.max(1, Math.round(absSeconds / 60)),
    });
  }
  if (absSeconds < 60 * 60 * 24) {
    return i18n.t("time.shortHours", {
      value: Math.max(1, Math.round(absSeconds / (60 * 60))),
    });
  }
  if (absSeconds < 60 * 60 * 24 * 7) {
    return i18n.t("time.shortDays", {
      value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24))),
    });
  }
  if (absSeconds < 60 * 60 * 24 * 30) {
    return i18n.t("time.shortWeeks", {
      value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 7))),
    });
  }
  if (absSeconds < 60 * 60 * 24 * 365) {
    return i18n.t("time.shortMonths", {
      value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 30))),
    });
  }
  return i18n.t("time.shortYears", {
    value: Math.max(1, Math.round(absSeconds / (60 * 60 * 24 * 365))),
  });
}
