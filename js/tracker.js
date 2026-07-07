(function () {
  var pageEnterTs = Date.now();
  var sessionId = getOrCreateSessionId();
  var filterClicks = [];
  var clickSequence = [];
  var clickCoordinates = [];
  var lastClickTs = null;
  var dwellMap = {};
  var mouseGrid = {};
  var formStepStatus = {};
  var formCompleted = false;
  var consentGiven = false;
  var leadData = { name: '', email: '', projectType: '', description: '' };

  function getOrCreateSessionId() {
    var existing = sessionStorage.getItem('visitor_session_id');
    if (existing) return existing;
    var id = 'sess-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    sessionStorage.setItem('visitor_session_id', id);
    return id;
  }

  function detectDeviceType(ua) {
    return /Mobi|Android/i.test(ua) ? 'mobile' : 'desktop';
  }

  function detectBrowser(ua) {
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Other';
  }

  function toGridCell(x, y, pageWidth, pageHeight) {
    var cols = 20;
    var rows = 20;
    var safeWidth = pageWidth > 0 ? pageWidth : 1;
    var safeHeight = pageHeight > 0 ? pageHeight : 1;
    var col = Math.min(cols - 1, Math.max(0, Math.floor((x / safeWidth) * cols)));
    var row = Math.min(rows - 1, Math.max(0, Math.floor((y / safeHeight) * rows)));
    return row * cols + col;
  }

  function setupScrollDwell() {
    var sections = document.querySelectorAll('[data-section]');
    var visible = {};
    var lastTick = Date.now();

    function tick() {
      var now = Date.now();
      var elapsed = now - lastTick;
      lastTick = now;
      Object.keys(visible).forEach(function (section) {
        if (visible[section]) {
          dwellMap[section] = (dwellMap[section] || 0) + elapsed;
        }
      });
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var section = entry.target.getAttribute('data-section');
        visible[section] = entry.isIntersecting;
      });
    }, { threshold: 0.3 });

    sections.forEach(function (section) {
      observer.observe(section);
    });

    setInterval(tick, 1000);
  }

  function setupMouseTracking() {
    var lastMove = 0;
    document.addEventListener('mousemove', function (e) {
      var now = Date.now();
      if (now - lastMove < 200) return;
      lastMove = now;
      var cellId = toGridCell(e.pageX, e.pageY, document.documentElement.scrollWidth, document.documentElement.scrollHeight);
      mouseGrid[cellId] = (mouseGrid[cellId] || 0) + 1;
    });
  }

  function logFilterClick(category) {
    filterClicks.push(category);
  }

  function logProjectClick(projectId, x, y) {
    var now = Date.now();
    var deltaMs = lastClickTs === null ? null : now - lastClickTs;
    lastClickTs = now;
    clickSequence.push({ projectId: projectId, deltaMs: deltaMs });
    clickCoordinates.push({ x: x, y: y });
  }

  function logFormStep(step, action, durationMs) {
    formStepStatus[step] = { status: action, durationMs: durationMs };
    if (action === 'complete' && Number(step) === 3) formCompleted = true;
  }

  function setConsent(value) {
    consentGiven = value;
  }

  function setLeadData(data) {
    leadData = data;
  }

  function buildRow() {
    var ua = navigator.userAgent;
    return {
      token: (window.TRACKER_CONFIG && window.TRACKER_CONFIG.INGEST_TOKEN) || '',
      timestamp: new Date().toISOString(),
      sessionId: sessionId,
      page: window.TRACKER_PAGE || 'unknown',
      referrer: document.referrer || 'direct',
      userAgent: ua,
      deviceType: detectDeviceType(ua),
      browser: detectBrowser(ua),
      screenResolution: window.screen.width + 'x' + window.screen.height,
      viewportSize: window.innerWidth + 'x' + window.innerHeight,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      galleryFilterClicks: JSON.stringify(filterClicks),
      projectClickSequence: JSON.stringify(clickSequence),
      sectionDwellMs: JSON.stringify(dwellMap),
      mouseHeatmapGrid: JSON.stringify(mouseGrid),
      pageDurationMs: Date.now() - pageEnterTs,
      formStepStatus: JSON.stringify(formStepStatus),
      formCompleted: formCompleted,
      consentGiven: consentGiven,
      leadName: consentGiven ? leadData.name : '',
      leadEmail: consentGiven ? leadData.email : '',
      leadProjectType: consentGiven ? leadData.projectType : '',
      leadDescription: consentGiven ? leadData.description : '',
      clickCoordinates: JSON.stringify(clickCoordinates)
    };
  }

  function flushNow() {
    var url = window.TRACKER_CONFIG && window.TRACKER_CONFIG.APPS_SCRIPT_URL;
    if (!url) return;
    var row = buildRow();
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(row)], { type: 'text/plain;charset=utf-8' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(row)
        }).catch(function () {});
      }
    } catch (err) {
      // Swallow logging failures; never break the page for the visitor.
    }
  }

  function init() {
    setupScrollDwell();
    setupMouseTracking();
  }

  window.Tracker = {
    init: init,
    logFilterClick: logFilterClick,
    logProjectClick: logProjectClick,
    logFormStep: logFormStep,
    setConsent: setConsent,
    setLeadData: setLeadData,
    flushNow: flushNow
  };
})();
