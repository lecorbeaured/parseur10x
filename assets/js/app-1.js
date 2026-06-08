window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag("js", new Date());
  gtag("config", "G-FZRF7B4KP3");

  // Custom event helpers
  function trackEvent(name, params) {
    try { gtag('event', name, params || {}); } catch(e) {}
  }
