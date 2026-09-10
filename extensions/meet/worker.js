let port, sequence = 0;
const pending = new Map();
const identity = chrome.storage.local.get('bridgeIdentity').then(async data => {
  if (data.bridgeIdentity) return data.bridgeIdentity;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({bridgeIdentity: id});
  return id;
});
function rpc(action, payload) {
  if (!port) {
    port = chrome.runtime.connectNative('app.aguacate.speakers');
    port.onMessage.addListener(message => {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      request.resolve(message.error ? {collect: false} : message.data);
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      port = null;
      for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({collect: false}); }
      pending.clear();
    });
  }
  if (pending.size >= 32) return Promise.resolve({collect: false});
  return new Promise(resolve => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); resolve({collect: false}); }, 2000);
    pending.set(id, {resolve, timer});
    port.postMessage({id, action, payload});
  });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const url = sender.tab?.url;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !url || !/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#]|$)/.test(url)) return false;
  if (!['state', 'offer', 'activity'].includes(message.action) || JSON.stringify(message).length > 12000) return false;
  (async () => {
    const payload = {source: 'meet', target: `meet.${await identity}.${sender.tab.id}`, url: new URL(url).origin + new URL(url).pathname};
    if (message.action === 'activity') Object.assign(payload, {session: message.session, observed_at: message.observed_at, participants: message.participants, connection: message.connection});
    respond(await rpc(message.action, payload));
  })().catch(() => respond({collect: false}));
  return true;
});
