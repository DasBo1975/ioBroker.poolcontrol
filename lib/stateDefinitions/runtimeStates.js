"use strict";

/**
 * Legt alle States für Laufzeit- und Umwälzwerte an:
 * - runtime.total
 * - runtime.today
 * - runtime.formatted
 * - circulation.daily_total
 * - circulation.daily_required
 * - circulation.daily_remaining
 *
 * @param {import("iobroker").Adapter} adapter - ioBroker Adapter-Instanz
 */
async function createRuntimeStates(adapter) {
  // --- Kanal runtime ---
  await adapter.setObjectNotExistsAsync("runtime", {
    type: "channel",
    common: { name: "Pumpenlaufzeit" },
    native: {},
  });

  await adapter.setObjectNotExistsAsync("runtime.total", {
    type: "state",
    common: {
      name: "Gesamtlaufzeit",
      type: "number",
      role: "value.time",
      unit: "s",
      read: true,
      write: false,
    },
    native: {},
  });

  await adapter.setObjectNotExistsAsync("runtime.today", {
    type: "state",
    common: {
      name: "Tageslaufzeit",
      type: "number",
      role: "value.time",
      unit: "s",
      read: true,
      write: false,
    },
    native: {},
  });

  await adapter.setObjectNotExistsAsync("runtime.formatted", {
    type: "state",
    common: {
      name: "Formatierte Laufzeit heute",
      type: "string",
      role: "text",
      read: true,
      write: false,
    },
    native: {},
  });

  // --- Kanal circulation ---
  await adapter.setObjectNotExistsAsync("circulation", {
    type: "channel",
    common: { name: "Umwälzung" },
    native: {},
  });

  await adapter.setObjectNotExistsAsync("circulation.daily_total", {
    type: "state",
    common: {
      name: "Tägliche Umwälzmenge",
      type: "number",
      role: "value.volume",
      unit: "l",
      read: true,
      write: false,
    },
    native: {},
  });

  await adapter.setObjectNotExistsAsync("circulation.daily_required", {
    type: "state",
    common: {
      name: "Erforderliche tägliche Umwälzmenge",
      type: "number",
      role: "value.volume",
      unit: "l",
      read: true,
      write: false,
    },
    native: {},
  });
  await adapter.setStateAsync("circulation.daily_required", {
    val: 0,
    ack: true,
  });

  await adapter.setObjectNotExistsAsync("circulation.daily_remaining", {
    type: "state",
    common: {
      name: "Verbleibende Umwälzmenge heute",
      type: "number",
      role: "value.volume",
      unit: "l",
      read: true,
      write: false,
    },
    native: {},
  });
}

module.exports = {
  createRuntimeStates,
};
