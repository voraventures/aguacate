// Custom titlebar for Windows: drag region + min/max/close at top right.
// macOS uses native traffic lights (hiddenInset) and never renders this.
import React from "react";

const SvgBtn = ({ children }) => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.2">
    {children}
  </svg>
);

export default function Titlebar() {
  const control = (action) => window.aguacate?.windowControl?.(action);

  return (
    <div className="titlebar">
      <span className="titlebar-title">AGUACATE</span>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          aria-label="Minimize"
          onClick={() => control("minimize")}
        >
          <SvgBtn>
            <line x1="1" y1="5.5" x2="10" y2="5.5" />
          </SvgBtn>
        </button>
        <button
          className="titlebar-btn"
          aria-label="Maximize or restore"
          onClick={() => control("maximize")}
        >
          <SvgBtn>
            <rect x="1.5" y="1.5" width="8" height="8" rx="1" />
          </SvgBtn>
        </button>
        <button
          className="titlebar-btn close"
          aria-label="Close window"
          onClick={() => control("close")}
        >
          <SvgBtn>
            <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" />
            <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" />
          </SvgBtn>
        </button>
      </div>
    </div>
  );
}
