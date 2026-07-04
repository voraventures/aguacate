// Timeline tab — recreated from Aguacate Meeting.dc.html #5c: a vertical
// rail (time · dot · card). Milestones (start/wrap) are hollow dots with no
// card. Real data only: the mockup also tags cards TOPIC/DECISION/ACTIONS,
// but our backend has no in-meeting timestamp for a decision/topic/action
// (only a wall-clock "recorded at", not "said at mm:ss") — inventing one
// would fabricate data, so entries are speaker turns and flagged moments,
// the two things we can timestamp for real.
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

function fmtTs(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function TimelineTab({ meeting }) {
  const { t } = useTranslation();
  const segments = meeting.transcript?._segments || [];
  const markers = meeting.markers || [];
  const duration = meeting.transcript?.duration_sec || 0;

  const items = useMemo(() => {
    const turns = [];
    for (const seg of segments) {
      const last = turns[turns.length - 1];
      if (last && last.kind === "turn" && last.speaker === (seg.speaker || last.speaker)) {
        last.texts.push(seg.text);
        last.end = seg.end;
      } else {
        turns.push({
          kind: "turn",
          at: seg.start ?? 0,
          end: seg.end,
          speaker: seg.speaker || t("timeline.speakerFallback"),
          texts: [seg.text],
        });
      }
    }
    const flags = markers.map((at) => ({ kind: "flag", at }));
    const body = [...turns, ...flags].sort((a, b) => a.at - b.at);
    if (!body.length) return [];
    return [
      { kind: "milestone", at: 0, label: t("timeline.started") },
      ...body,
      ...(duration > 0
        ? [{ kind: "milestone", at: duration, label: t("timeline.wrapUp") }]
        : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, markers, duration, t]);

  if (items.length === 0) {
    return (
      <div className="empty-state" style={{ height: "auto", padding: "80px 24px" }}>
        <div className="empty-title">{t("timeline.emptyHead")}</div>
        <div className="empty-sub">{t("timeline.emptySub")}</div>
      </div>
    );
  }

  return (
    <div className="timeline">
      <div className="timeline-rail" />
      <div className="timeline-items">
        {items.map((it, i) => (
          <div className={`tl-row tl-row-${it.kind}`} key={i}>
            <span className="tl-time">{fmtTs(it.at)}</span>
            <span className={`tl-dot${it.kind === "milestone" ? " tl-dot-hollow" : ""}`} />
            {it.kind === "milestone" && <div className="tl-milestone-label">{it.label}</div>}
            {it.kind === "flag" && (
              <div className="tl-card">
                <span className="tl-pill tl-pill-flag">{t("timeline.flaggedPill")}</span>
                <div className="tl-card-title">{t("timeline.flagged")}</div>
              </div>
            )}
            {it.kind === "turn" && (
              <div className="tl-card">
                <div className="tl-speaker">{it.speaker}</div>
                <p className="tl-text">{it.texts.join(" ")}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
