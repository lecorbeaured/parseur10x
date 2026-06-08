(function () {
  // Add helpful external-link behavior
  document.querySelectorAll('a[href^="http"]').forEach(function (link) {
    if (!link.hostname.includes(location.hostname)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  // Add basic mobile nav behavior if a mobile toggle exists later
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navMenu = document.querySelector('[data-nav-menu]');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      const isOpen = navMenu.getAttribute('data-open') === 'true';
      navMenu.setAttribute('data-open', String(!isOpen));
      navToggle.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  // Lightweight analytics event helper
  window.trackParseurEvent = function (eventName, params) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params || {});
    }
  };
})();
