// No audio/video capture. No page-world messaging or page-exposed credentials.
let busy = false;
setInterval(async () => {
  if (busy || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(location.pathname)) return;
  busy = true;
  try {
    if (!(await chrome.runtime.sendMessage({action: 'state'}))?.active) return;
    if (!document.querySelector('[data-participant-id]')) return;
    const state = await chrome.runtime.sendMessage({action: 'offer'});
    if (!state?.collect) return;
    const observed_at = Date.now() / 1000;
    const participants = AguacateMeetAdapter.read();
    const connection = document.querySelector('[data-participant-id][data-is-speaking]') ? 'connected' : 'unavailable';
    await chrome.runtime.sendMessage({action: 'activity', session: state.session, observed_at, participants, connection});
  } catch { /* fail closed on disconnect */ }
  finally { busy = false; }
}, 250);
