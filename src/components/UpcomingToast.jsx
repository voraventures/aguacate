// The 5-minute calendar heads-up — README section 6 / SPEC-calendar-autorecord.md.
// Non-blocking and dismissible, unlike RecordPrompt's confirm modal at T-35s:
// this is purely informational ("here's what's about to happen"), not a
// decision the user has to make.
import React from "react";
import { useTranslation } from "react-i18next";
import { useStore, useLogo } from "../store.jsx";

function fmtMinutes(sec) {
  return Math.max(1, Math.round((sec || 0) / 60));
}

export default function UpcomingToast() {
  const { t } = useTranslation();
  const { upcomingWarning, setUpcomingWarning } = useStore();
  const logoUrl = useLogo();

  if (!upcomingWarning) return null;

  return (
    <div className="upcoming-toast" role="status">
      <img className="logo-img" src={logoUrl} alt="" aria-hidden="true" />
      <div className="upcoming-toast-body">
        <div className="upcoming-toast-title">
          {t("upcomingToast.startsIn", {
            title: upcomingWarning.title,
            minutes: fmtMinutes(upcomingWarning.seconds_until_start),
          })}
        </div>
        <div className="upcoming-toast-sub">{t("upcomingToast.willTranscribe")}</div>
      </div>
      <button
        className="upcoming-toast-dismiss"
        aria-label={t("upcomingToast.dismiss")}
        onClick={() => setUpcomingWarning(null)}
      >
        ✕
      </button>
    </div>
  );
}
