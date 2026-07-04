// The Meeting Note PDF — recreated from design-reference/Meeting Note PDF.dc.html.
// Rendered hidden (see the `#pdf-print-root` rules in styles.css) and only
// shown under @media print, which is what Electron's printToPDF respects —
// so this is the literal page printToPDF captures, not a re-implementation
// in a PDF-drawing library. It mirrors whichever meeting is currently open;
// no separate data-fetch or "prepare" step needed.
// Portaled directly onto <body> (a true sibling of #root, not nested inside
// it) — the print CSS hides every OTHER body child, which only works if
// this one isn't itself inside the subtree being hidden.
import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useStore, useLogo } from "../store.jsx";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
}

function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return "";
  const mins = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  if (mins < 1) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim();
}

// "Key Discussions" / free-text sections come as newline-separated sentences,
// each usually lead by a **Bold Label**: our own Markdown component already
// parses **bold** safely — this just renders each non-empty line as one
// dot-row instead of Markdown's default stacked <p> blocks.
function DotList({ text }) {
  if (!text?.trim()) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <ul className="pdf-dotlist">
      {lines.map((line, i) => (
        <li key={i}>
          <span className="pdf-dot" />
          <span>{renderBold(line)}</span>
        </li>
      ))}
    </ul>
  );
}

// Real content only ever needs **bold** — same subset Markdown.jsx supports.
function renderBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

// "Next Steps" comes as "1. do this\n2. do that" — split the real numbering
// out so we can render it in the template's own mono two-digit style.
function NumberedList({ text }) {
  if (!text?.trim()) return null;
  const items = text
    .split("\n")
    .map((l) => l.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
  return (
    <ol className="pdf-numlist">
      {items.map((item, i) => (
        <li key={i}>
          <span className="pdf-num">{String(i + 1).padStart(2, "0")}</span>
          <span>{renderBold(item)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function PdfPrintRoot() {
  const { t } = useTranslation();
  const { meetingDetail: m } = useStore();
  const logoUrl = useLogo();

  if (!m) return null;

  const sections = m.notes?.sections || {};
  const intel = m.intelligence || {};
  const actions = intel.actions || [];
  const decisions = intel.decisions || [];
  const participants = intel.participants || [];
  const compliance = (sections["Compliance Flags"] || "").trim();
  const complianceClear = !compliance || /^none/i.test(compliance);
  const duration = fmtDuration(m.started_at, m.ended_at);

  return createPortal(
    <div id="pdf-print-root">
      <div className="pdf-page">
        <div className="pdf-header">
          <span>{t("pdf.eyebrow")}</span>
          <span>{m.title}</span>
        </div>

        <div className="pdf-masthead">
          <img className="logo-img" src={logoUrl} alt="" aria-hidden="true" />
          <span className="pdf-wordmark">Aguacate</span>
        </div>

        <h1 className="pdf-title">{m.title}</h1>
        <div className="pdf-meta">
          <span>{fmtDate(m.started_at)}</span>
          {duration && (
            <>
              <span className="pdf-meta-sep">·</span>
              <span>{duration}</span>
            </>
          )}
          {participants.length > 0 && (
            <>
              <span className="pdf-meta-sep">·</span>
              <span>{t("pdf.participantCount", { count: participants.length })}</span>
            </>
          )}
        </div>

        {sections["Executive Summary"] && (
          <div className="pdf-hero">
            <img className="pdf-hero-watermark" src={logoUrl} alt="" aria-hidden="true" />
            <div className="pdf-hero-eyebrow">{t("pdf.execSummary")}</div>
            <p className="pdf-hero-text">{sections["Executive Summary"]}</p>
          </div>
        )}

        {sections["Key Discussions"] && (
          <>
            <div className="pdf-eyebrow">{t("pdf.keyDiscussions")}</div>
            <DotList text={sections["Key Discussions"]} />
          </>
        )}

        {decisions.length > 0 && (
          <>
            <div className="pdf-eyebrow">{t("pdf.decisionsMade")}</div>
            <ul className="pdf-dotlist">
              {decisions.map((d) => (
                <li key={d.id} className={d.status === "superseded" ? "pdf-superseded" : ""}>
                  <span className="pdf-dot" />
                  <span>{d.text}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {actions.length > 0 && (
          <>
            <div className="pdf-eyebrow">{t("pdf.actionItems")}</div>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>{t("pdf.owner")}</th>
                  <th>{t("pdf.action")}</th>
                  <th className="pdf-right">{t("pdf.due")}</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className="pdf-nowrap">{a.owner || t("notes.action.tbd")}</td>
                    <td className={a.status === "done" ? "pdf-superseded" : ""}>{a.action}</td>
                    <td className="pdf-mono pdf-right pdf-nowrap">
                      {a.status === "done" ? t("pdf.done") : a.due}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {sections["Next Steps"] && (
          <>
            <div className="pdf-eyebrow">{t("pdf.nextSteps")}</div>
            <NumberedList text={sections["Next Steps"]} />
          </>
        )}

        <div className="pdf-eyebrow">{t("pdf.complianceFlags")}</div>
        <div className={`pdf-compliance${complianceClear ? "" : " pdf-compliance-flagged"}`}>
          {complianceClear ? (
            <>
              <span className="pdf-compliance-check">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span>{t("pdf.noneIdentified")}</span>
            </>
          ) : (
            <span>{compliance}</span>
          )}
        </div>

        <div className="pdf-footer">
          <span>{t("pdf.generatedBy")}</span>
          <span>{fmtDate(new Date().toISOString())}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
