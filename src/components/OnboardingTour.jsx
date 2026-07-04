import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../store.jsx";

// Steps spotlight elements tagged with data-tour="..." across the app.
// Titles/descriptions live under tour.steps.<key> in the locale files.
const STEPS = [
  { sel: "record-btn", place: "right", key: "record" },
  { sel: "meeting-list", place: "right", key: "list" },
  { sel: "notes-panel", place: "left", key: "notes" },
  { sel: "action-items", fallback: "notes-panel", place: "left", key: "actions" },
  { sel: "nav-section", place: "right", key: "intel" },
];

const PAD = 6;
const TT_W = 260;

function findTarget(s) {
  if (!s) return null;
  let el = document.querySelector(`[data-tour="${s.sel}"]`);
  if (!el && s.fallback) el = document.querySelector(`[data-tour="${s.fallback}"]`);
  return el;
}

export default function OnboardingTour({ onComplete }) {
  const { t } = useTranslation();
  const { meetings, selectedId, selectMeeting } = useStore();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [ttH, setTtH] = useState(200);
  const ttRef = useRef(null);

  const isFinal = step >= STEPS.length;

  // Auto-select the demo (or first) meeting once so notes-panel targets exist.
  useEffect(() => {
    if (!selectedId && meetings && meetings.length) {
      const demo = meetings.find((m) => /demo/i.test(m.title || "")) || meetings[0];
      if (demo) selectMeeting(demo.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position the spotlight on the current step's target (re-measures when the
  // selected meeting finishes loading, so steps 3/4 land on real content).
  useEffect(() => {
    if (isFinal) {
      setRect(null);
      return;
    }
    let raf = 0;
    const run = () => {
      const el = findTarget(STEPS[step]);
      if (el) {
        try {
          el.scrollIntoView({ block: "nearest" });
        } catch {
          /* no-op */
        }
        raf = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
      } else {
        setRect(null);
      }
    };
    const t = setTimeout(run, 60);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [step, isFinal, meetings, selectedId]);

  // Keep the spotlight aligned on resize.
  useEffect(() => {
    const onResize = () => {
      if (isFinal) return;
      const el = findTarget(STEPS[step]);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step, isFinal]);

  useLayoutEffect(() => {
    if (ttRef.current) {
      const h = ttRef.current.offsetHeight;
      setTtH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    }
  });

  const finish = useCallback(() => {
    localStorage.setItem("aguacate_onboarded", "true");
    localStorage.setItem("aguacate_tour_done", "true");
    onComplete?.();
  }, [onComplete]);

  const advance = useCallback(() => {
    setStep((s) => (s < STEPS.length ? s + 1 : s));
  }, []);

  const startRecording = useCallback(() => {
    finish();
    // Defer so the overlay is gone before the click reaches the button.
    setTimeout(() => {
      document.querySelector('[data-tour="record-btn"]')?.click();
    }, 0);
  }, [finish]);

  // Keyboard: Escape = skip, Right arrow = next.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, advance]);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const spotStyle =
    rect && !isFinal
      ? {
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
        }
      : { top: cy, left: cx, width: 0, height: 0 };

  let ttStyle;
  if (!rect || isFinal) {
    ttStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const place = STEPS[step].place;
    let left = place === "right" ? rect.right + 16 : rect.left - 16 - TT_W;
    left = Math.max(16, Math.min(left, window.innerWidth - TT_W - 16));
    let top = Math.max(16, Math.min(rect.top, window.innerHeight - ttH - 16));
    ttStyle = { left, top };
  }

  return createPortal(
    <div className="tour-root">
      <div className="tour-catcher" />
      <div className="tour-spotlight" style={spotStyle} />
      <div className="tour-tooltip" style={ttStyle} ref={ttRef}>
        {isFinal ? (
          <>
            <div className="tour-title">{t("tour.final.title")}</div>
            <div className="tour-desc">{t("tour.final.desc")}</div>
            <div className="tour-actions tour-actions-final">
              <button className="tour-next" onClick={finish}>
                {t("tour.final.cta")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="tour-step-indicator">
              {t("tour.stepIndicator", { step: step + 1, total: STEPS.length })}
            </div>
            <div className="tour-title">{t(`tour.steps.${STEPS[step].key}.title`)}</div>
            <div className="tour-desc">{t(`tour.steps.${STEPS[step].key}.desc`)}</div>
            <div className="tour-actions">
              <div className="tour-dots">
                {STEPS.map((_, i) => (
                  <span key={i} className={`tour-dot${i === step ? " active" : ""}`} />
                ))}
              </div>
              <div className="tour-buttons">
                <button className="tour-skip" onClick={finish}>
                  {t("tour.skip")}
                </button>
                <button className="tour-next" onClick={advance}>
                  {step === STEPS.length - 1 ? t("tour.done") : t("tour.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
