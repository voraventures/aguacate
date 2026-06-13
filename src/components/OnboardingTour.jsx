import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store.jsx";

// Steps spotlight elements tagged with data-tour="..." across the app.
const STEPS = [
  {
    sel: "record-btn",
    place: "right",
    title: "Record any meeting",
    desc: "No bot joins your call. No audio leaves this Mac. Hit Record and Aguacate captures everything locally with Whisper AI.",
  },
  {
    sel: "meeting-list",
    place: "right",
    title: "Your meetings, organized",
    desc: "Every recording appears here automatically. Click any meeting to open its AI-generated notes, action items, and decisions.",
  },
  {
    sel: "notes-panel",
    place: "left",
    title: "AI notes, instantly",
    desc: "Claude reads your transcript and writes structured notes — executive summary, key discussions, decisions, and action items.",
  },
  {
    sel: "action-items",
    fallback: "notes-panel",
    place: "left",
    title: "Action items extracted",
    desc: "Every action item is pulled out automatically with owner and due date. Mark them complete to track accountability.",
  },
  {
    sel: "my-work",
    place: "right",
    title: "Your personal dashboard",
    desc: "Open actions and decisions this week — pulled from all your meetings in one place. Click any row to dive in.",
  },
  {
    sel: "nav-section",
    place: "right",
    title: "Cross-meeting intelligence",
    desc: "Actions, Decisions, Topics, and People views surface patterns across all your meetings automatically.",
  },
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
            <div className="tour-title">You're all set</div>
            <div className="tour-desc">
              Explore your demo meeting or hit Record whenever you're ready to capture your first real meeting.
            </div>
            <div className="tour-actions tour-actions-final">
              <button className="tour-next" onClick={finish}>
                Got it, let's go
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="tour-step-indicator">STEP {step + 1} OF {STEPS.length}</div>
            <div className="tour-title">{STEPS[step].title}</div>
            <div className="tour-desc">{STEPS[step].desc}</div>
            <div className="tour-actions">
              <div className="tour-dots">
                {STEPS.map((_, i) => (
                  <span key={i} className={`tour-dot${i === step ? " active" : ""}`} />
                ))}
              </div>
              <div className="tour-buttons">
                <button className="tour-skip" onClick={finish}>
                  Skip
                </button>
                <button className="tour-next" onClick={advance}>
                  {step === STEPS.length - 1 ? "Done" : "Next"}
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
