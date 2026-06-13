// Original Aguacate empty-state illustrations.
// Style: minimal, slightly geometric, line-first with subtle theme-aware
// fills. Every color is a CSS variable so all six themes render correctly.
import React from "react";

const Base = ({ size = 120, vb = 120, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${vb} ${vb}`}
    fill="none"
    role="img"
    {...rest}
  >
    {children}
  </svg>
);

/* Calendar with a marked day and a live waveform — "a meeting, about to be
   captured". */
export const EmptyMeetings = (props) => (
  <Base {...props}>
    <rect x="22" y="26" width="76" height="64" rx="10" fill="var(--accent-softer)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M22 44h76" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M40 18v14M80 18v14" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    <g stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.55">
      <path d="M36 56h8M52 56h8M68 56h8M36 68h8M52 68h8" />
    </g>
    <circle cx="72" cy="68" r="6.5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <g stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
      <path d="M38 102v-4M48 104v-8M58 100v-1M68 105v-10M78 102v-4M88 103v-6" />
    </g>
  </Base>
);

/* Structured document with extracted intelligence nodes lifting off the
   page — "notes become signal". */
export const EmptyNotes = (props) => (
  <Base vb={140} size={140} {...props}>
    <path
      d="M38 22h48l16 16v78a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6Z"
      fill="var(--accent-softer)"
      stroke="var(--accent)"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <path d="M86 22v16h16" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
    <g stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55">
      <path d="M44 52h36M44 64h44M44 88h44M44 100h28" />
    </g>
    <path d="M44 76h22" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="104" cy="76" r="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M72 76h25" stroke="var(--accent)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
    <circle cx="120" cy="56" r="3.5" fill="var(--accent)" opacity="0.7" />
    <circle cx="118" cy="98" r="3" stroke="var(--accent)" strokeWidth="2" />
  </Base>
);

/* Action chips advancing forward — a circle resolved (check) and squares
   still in motion (arrows). */
export const EmptyActions = (props) => (
  <Base {...props}>
    <circle cx="38" cy="34" r="14" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M31.5 34.5l4.5 4.5 9-9" stroke="var(--accent)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="56" y="52" width="28" height="28" rx="8" fill="var(--accent-softer)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M65 66h11M72 60.5l5.5 5.5-5.5 5.5" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="26" y="74" width="24" height="24" rx="7" stroke="var(--muted)" strokeWidth="2.2" opacity="0.55" />
    <path d="M33 86h8.5M38.5 81.5 43 86l-4.5 4.5" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
    <path d="M84 30c6 2 10 7 10 14" stroke="var(--accent)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
  </Base>
);

/* A path that forks: the chosen branch solid and terminal, the road not
   taken fading to dashes. */
export const EmptyDecisions = (props) => (
  <Base {...props}>
    <path d="M60 102V66" stroke="var(--accent)" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M60 66C60 50 44 52 40 38" stroke="var(--muted)" strokeWidth="2.4" strokeDasharray="3 6" strokeLinecap="round" opacity="0.6" />
    <path d="M60 66c0-16 16-14 20-28" stroke="var(--accent)" strokeWidth="2.8" strokeLinecap="round" />
    <circle cx="60" cy="102" r="5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <circle cx="38" cy="30" r="7" stroke="var(--muted)" strokeWidth="2.2" opacity="0.6" />
    <circle cx="82" cy="30" r="9" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M78.5 30.5l2.5 2.5 5-5" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M52 84h16" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
  </Base>
);

/* Tag constellations — labelled nodes finding each other. */
export const EmptyTopics = (props) => (
  <Base {...props}>
    <g stroke="var(--accent)" strokeWidth="2" opacity="0.5">
      <path d="M48 44 36 72M58 46l22 18M44 80h28" />
    </g>
    <path d="M40 30h14l6 6-6 6H40a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4Z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="34" cy="82" r="9" fill="var(--accent-softer)" stroke="var(--accent)" strokeWidth="2.5" />
    <circle cx="84" cy="68" r="11" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <circle cx="84" cy="68" r="3" fill="var(--accent)" />
    <circle cx="34" cy="82" r="2.5" fill="var(--accent)" opacity="0.7" />
    <circle cx="96" cy="34" r="4" stroke="var(--muted)" strokeWidth="2.2" opacity="0.55" />
    <path d="M90 38l-4 6" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
  </Base>
);

/* Three people in constellation — the center contributor lit. */
export const EmptyPeople = (props) => (
  <Base {...props}>
    <g stroke="var(--accent)" strokeWidth="2" opacity="0.45">
      <path d="M44 58 60 50M76 58 60 50M48 84h24" />
    </g>
    <circle cx="60" cy="38" r="11" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.5" />
    <path d="M44 70c0-8 7-13 16-13s16 5 16 13" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="30" cy="62" r="8" stroke="var(--muted)" strokeWidth="2.2" opacity="0.55" />
    <path d="M19 86c0-6 5-10 11-10s11 4 11 10" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
    <circle cx="90" cy="62" r="8" stroke="var(--muted)" strokeWidth="2.2" opacity="0.55" />
    <path d="M79 86c0-6 5-10 11-10s11 4 11 10" stroke="var(--muted)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
    <circle cx="60" cy="35.5" r="3" fill="var(--accent)" opacity="0.65" />
  </Base>
);

export const EMPTY_ART = {
  meetings: EmptyMeetings,
  actions: EmptyActions,
  decisions: EmptyDecisions,
  topics: EmptyTopics,
  people: EmptyPeople,
};
