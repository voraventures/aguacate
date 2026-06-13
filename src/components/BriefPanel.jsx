// Meeting Brief: pre-meeting intelligence from your own corpus.
import React from "react";
import { useStore } from "../store.jsx";
import { ArrowIcon, XIcon } from "./icons.jsx";

export default function BriefPanel() {
  const { brief, setBrief, selectMeeting, setNav } = useStore();
  if (!brief) return null;

  const go = (meetingId) => {
    setBrief(null);
    setNav("meetings");
    selectMeeting(meetingId);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setBrief(null)}>
      <div className="modal" style={{ width: 640 }}>
        <div className="modal-header">
          <div>
            <div className="detail-kicker">MEETING BRIEF</div>
            <div className="modal-title">{brief.title}</div>
            {brief.minutes_until != null && (
              <div className="field-help" style={{ marginTop: 4 }}>
                Starts in {brief.minutes_until} minute{brief.minutes_until === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={() => setBrief(null)}>
            <XIcon size={15} />
          </button>
        </div>
        <div className="modal-body">
          {brief.talking_points?.length > 0 && (
            <div className="section-card" style={{ marginTop: 0 }}>
              <div className="section-label">Suggested talking points</div>
              <div className="section-body">
                <ul>
                  {brief.talking_points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {brief.open_actions?.length > 0 && (
            <div className="section-card">
              <div className="section-label">Open actions with this group</div>
              {brief.open_actions.map((a) => (
                <div className="action-row" key={a.id}>
                  <span className={`owner-chip${a.owner === "TBD" ? " tbd" : ""}`}>{a.owner}</span>
                  <span className="action-text">{a.action}</span>
                  {a.due && <span className="action-due">{a.due}</span>}
                </div>
              ))}
            </div>
          )}

          {brief.decisions?.length > 0 && (
            <div className="section-card">
              <div className="section-label">Standing decisions</div>
              <div className="section-body">
                <ul>
                  {brief.decisions.slice(0, 6).map((d) => (
                    <li key={d.id}>{d.text}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {brief.meetings?.length > 0 && (
            <div className="section-card">
              <div className="section-label">Previous meetings</div>
              {brief.meetings.slice(0, 5).map((m) => (
                <button key={m.id} className="related-row" onClick={() => go(m.id)}>
                  <span className="related-title">
                    {m.title} <ArrowIcon size={11} />
                  </span>
                  <span className="intel-sub">{new Date(m.started_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
