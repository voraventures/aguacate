// Meeting Coach: live conversational intelligence overlay during recording.
import React from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store.jsx";

function Meter({ value, warn }) {
  return (
    <div className="coach-meter">
      <div
        className={`coach-meter-fill${warn ? " warn" : ""}`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export default function CoachPanel() {
  const { t } = useTranslation();
  const { recording, coachData, coachOpen, setCoachOpen, muted, toggleMute, markerCount, dropMarker } =
    useStore();

  if (!recording.active) return null;

  const c = coachData;
  const density = c?.talk_density ?? null;
  const densityWarn = density !== null && density > 0.75;
  const covered = c?.covered_sections?.length ?? 0;
  const total = c?.total_sections ?? 0;

  return (
    <div className={`coach-panel${coachOpen ? "" : " collapsed"}`}>
      <button
        className="coach-toggle"
        onClick={() => setCoachOpen(!coachOpen)}
        title={coachOpen ? t("coach.collapse") : t("coach.expand")}
      >
        {coachOpen ? "›" : "‹"}
      </button>
      {coachOpen && (
        <div className="coach-body">
          <div className="coach-title">{t("coach.title")}</div>

          {!c ? (
            <div className="coach-waiting">
              <span className="spinner" /> {t("coach.listening")}
            </div>
          ) : (
            <>
              <div className="coach-stat">
                <div className="coach-stat-row">
                  <span>{t("coach.speakingDensity")}</span>
                  <strong className={densityWarn ? "warn" : ""}>
                    {Math.round((density || 0) * 100)}%
                  </strong>
                </div>
                <Meter value={density || 0} warn={densityWarn} />
                {densityWarn && (
                  <div className="coach-hint">{t("coach.denseHint")}</div>
                )}
              </div>

              <div className="coach-grid">
                <div className="coach-cell">
                  <strong>{c.questions}</strong>
                  <span>{t("coach.questions")}</span>
                </div>
                <div className="coach-cell">
                  <strong className={c.fillers > 12 ? "warn" : ""}>{c.fillers}</strong>
                  <span>{t("coach.fillers")}</span>
                </div>
                <div className="coach-cell">
                  <strong>{c.long_silences}</strong>
                  <span>{t("coach.silences")}</span>
                </div>
                <div className="coach-cell">
                  <strong>{t("coach.minutes", { count: Math.max(1, Math.round((c.elapsed_sec || 0) / 60)) })}</strong>
                  <span>{t("coach.elapsed")}</span>
                </div>
              </div>

              {c.questions === 0 && c.elapsed_sec > 600 && (
                <div className="coach-hint">{t("coach.noQuestionsHint")}</div>
              )}

              {total > 0 && (
                <div className="coach-stat">
                  <div className="coach-stat-row">
                    <span>{t("coach.coverage")}</span>
                    <strong>
                      {covered}/{total}
                    </strong>
                  </div>
                  <div className="coach-sections">
                    {(c.covered_sections || []).map((s) => (
                      <span key={s} className="coach-section done">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="coach-actions">
            <button
              className={`tool-btn${muted ? " danger" : ""}`}
              onClick={toggleMute}
              title={t("coach.muteTitle")}
            >
              {muted ? `● ${t("coach.muted")}` : t("coach.muteZone")}
            </button>
            <button className="tool-btn" onClick={dropMarker} title="⌘⇧M">
              {t("coach.flagMoment")}{markerCount > 0 ? ` (${markerCount})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
