import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "./icons.jsx";

// Non-modal: the meeting and dock remain operable. Restore focus on close.
export default function SettingsPanel({ title, section, onClose, children }) {
  const { t } = useTranslation();
  const panel = useRef(null);
  const heading = useRef(null);
  const origin = useRef(document.activeElement);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const node = panel.current;
    const key = e => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="menu"], .settings-layer > .modal-backdrop')) {
        e.preventDefault(); closeRef.current();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (node?.contains(document.activeElement) || document.activeElement === document.body) origin.current?.focus();
    };
  }, []);
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement) && document.activeElement !== document.body) origin.current = document.activeElement;
    heading.current?.focus();
    panel.current?.querySelector(".modal-body")?.scrollTo(0, 0);
  }, [section]);
  return <section ref={panel} className="settings-panel modal settings-modal" role="dialog" aria-labelledby="settings-panel-title">
    <div className="modal-header">
      <div><div className="panel-kicker">{t("settings.title")}</div><h2 ref={heading} tabIndex={-1} id="settings-panel-title" className="modal-title">{title}</h2></div>
      <button className="icon-btn" onClick={onClose} aria-label={t("dock.closeSettings", { defaultValue: "Close settings" })}><XIcon size={20} /></button>
    </div>
    {children}
  </section>;
}
