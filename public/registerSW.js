// No-op replacement for the old Workbox registration script.
// Older cached HTML may still request this file; make that request clean up the
// stale app-shell worker instead of registering it again.
(function () {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    registrations.forEach(function (registration) {
      var url = registration.active && registration.active.scriptURL ||
        registration.waiting && registration.waiting.scriptURL ||
        registration.installing && registration.installing.scriptURL || '';
      if (/\/(sw|service-worker)\.js(?:$|[?#])/.test(url)) {
        registration.unregister().catch(function () {});
      }
    });
  }).catch(function () {});
}());