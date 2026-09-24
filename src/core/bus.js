// Synchronous event bus — the only way slices talk to each other.
// Every event name in use is listed in EVENTS.md next to this file.
export function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => this.off(name, fn);
    },
    off(name, fn) {
      const list = handlers.get(name);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    emit(name, payload) {
      const list = handlers.get(name);
      if (!list) return;
      for (let i = 0; i < list.length; i++) list[i](payload);
    },
  };
}
