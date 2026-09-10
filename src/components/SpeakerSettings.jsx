import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api.js';

export default function SpeakerSettings({ enabled, onSaved }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [platforms, setPlatforms] = useState({});
  const [activity, setActivity] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const [data, native] = await Promise.all([api.get('/api/speakers/status'), window.aguacate?.speakerSetup?.('status')]);
        if (live) { setStatus(data.models); setPlatforms(native || {}); setActivity(data.activity || {}); }
      } catch { if (live) setError(true); }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const action = async fn => {
    setBusy(true); setError(false);
    try { await fn(); } catch { setError(true); } finally { setBusy(false); }
  };
  const setup = platform => action(async () => {
    const result = await window.aguacate?.speakerSetup?.(platform);
    if (!result || result.error) throw new Error('Setup unavailable');
    setPlatforms(result);
  });
  return <section className="speaker-settings" aria-labelledby="speaker-settings-title">
    <h3 id="speaker-settings-title" className="set-section-label">{t('speakers.title')}</h3>
    <div className="set-card speaker-card">
      <label className="speaker-toggle"><span className="set-card-name">{t('speakers.enable')}</span>
        <input type="checkbox" checked={enabled} disabled={busy} onChange={e => {
          const next = e.target.checked;
          action(async () => { await api.post('/api/settings', {key: 'speaker_identification', value: next}); onSaved(next); });
        }} />
      </label>
      <p className="set-card-desc">{t('speakers.description')}</p>
      <div className="speaker-setup-row"><span>{t('speakers.models')}</span><span role="status">{t(`speakers.states.${status?.state || 'loading'}`)}</span></div>
      {status?.state === 'downloading' ? <>
        <progress aria-label={t('speakers.models')} value={status.progress || 0} max="1" />
        <button className="btn secondary" disabled={busy} onClick={() => action(() => api.post('/api/speakers/models/cancel', {}))}>{t('speakers.cancel')}</button>
      </> : status?.state !== 'ready' && <button className="btn secondary" disabled={busy || !status} onClick={() => action(async () => setStatus(await api.post('/api/speakers/models/install', {})))}>{t(status?.state === 'error' ? 'speakers.retry' : 'speakers.download')}</button>}
      {status?.runtime_available === false && <p className="set-card-desc">{t('speakers.runtimeMissing')}</p>}
      {['zoom', 'meet'].map(platform => <div className="speaker-platform" key={platform}>
        <div className="speaker-setup-row"><span>{platform === 'zoom' ? 'Zoom Workplace' : 'Google Meet'}</span><span>{t(`speakers.states.${platforms[platform] || 'setup_required'}`)}</span></div>
        <span className="set-card-desc">{t(`speakers.states.${activity[platform] || 'inactive'}`)}</span>
        <button className="btn secondary" disabled={busy || platforms[platform] === 'unsupported'} onClick={() => setup(platform)}>{t(platform === 'zoom' ? 'speakers.zoomSetup' : 'speakers.meetSetup')}</button>
      </div>)}
      <p className="set-card-desc">{t('speakers.experimental')}</p>
      {error && <p role="alert">{t('speakers.error')}</p>}
    </div>
  </section>;
}
