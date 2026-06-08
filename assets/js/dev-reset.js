(function () {
  if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  window.parseurDevReset = function () {
    localStorage.removeItem('parseur10x_dispute_tracker_v1');
    localStorage.removeItem('parseur10x_latest_analysis_v1');
    location.reload();
  };
})();
