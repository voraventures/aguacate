// Conservative adapter contract. No CSS-class inference or roster-order guesses.
// Platform qualification must verify these semantic attributes on supported Meet
// versions. If Meet changes/exposes no explicit activity, return no names.
globalThis.AguacateMeetAdapter = {
  read(root = document) {
    const people = new Map();
    for (const tile of root.querySelectorAll('[data-participant-id]')) {
      const speaking = tile.getAttribute('data-is-speaking');
      if (speaking !== 'true') continue;
      const id = tile.getAttribute('data-participant-id');
      const name = tile.getAttribute('data-participant-name') || tile.querySelector('[data-self-name]')?.getAttribute('data-self-name');
      if (!id || id.length > 128 || !name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) continue;
      people.set(id, {id, name});
      if (people.size > 20) return [];
    }
    return [...people.values()];
  },
};
