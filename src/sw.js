"use strict";

// ponytail: presence check only. Wisp Mobile is useless without the PC, so the
// worker never caches the chat shell; it exists for PWA installability.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
