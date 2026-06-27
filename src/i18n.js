// i18next setup. Languages bundle statically (Vite). Detection order:
// saved localStorage choice → OS language (navigator.language) → "en".
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import es from "./locales/es/translation.json";
import pt from "./locales/pt/translation.json";
import fr from "./locales/fr/translation.json";
import zh from "./locales/zh/translation.json";
import ko from "./locales/ko/translation.json";

export const SUPPORTED = ["en", "es", "pt", "fr", "zh", "ko"];
const STORAGE_KEY = "aguacate_language";

const resources = {
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
  fr: { translation: fr },
  zh: { translation: zh },
  ko: { translation: ko },
};

// Map an OS/browser locale ("es-ES", "zh-CN") to a supported base code.
function baseLang(tag) {
  return String(tag || "").toLowerCase().split("-")[0];
}

function detectLang() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SUPPORTED.includes(saved)) return saved;
  const os = baseLang(navigator.language);
  return SUPPORTED.includes(os) ? os : "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLang(),
  fallbackLng: "en",
  supportedLngs: SUPPORTED,
  interpolation: { escapeValue: false }, // React already escapes
});

export function setLanguage(code) {
  const lang = SUPPORTED.includes(code) ? code : "en";
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

export default i18n;
