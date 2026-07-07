(function () {
  var MAX_STEP = 3;
  var currentStep = 1;
  var stepEnterTs = Date.now();
  var completed = false;
  var formData = { name: '', email: '', projectType: '', description: '' };

  function clampStep(step) {
    return Math.min(MAX_STEP, Math.max(1, step));
  }

  function isStepValid(step, data) {
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (step === 1) {
      return Boolean(data.name && data.name.trim() && EMAIL_RE.test(data.email || ''));
    }
    if (step === 2) {
      return Boolean(data.projectType && data.description && data.description.trim());
    }
    return true;
  }

  function readStep1() {
    formData.name = document.getElementById('field-name').value;
    formData.email = document.getElementById('field-email').value;
  }

  function readStep2() {
    formData.projectType = document.getElementById('field-project-type').value;
    formData.description = document.getElementById('field-description').value;
  }

  function showStep(step) {
    document.querySelectorAll('.form-step').forEach(function (el) {
      el.style.display = el.getAttribute('data-step') === String(step) ? 'block' : 'none';
    });
    document.querySelectorAll('.progress-step').forEach(function (el) {
      var stepNum = Number(el.getAttribute('data-step'));
      el.classList.toggle('active', stepNum <= step);
    });
  }

  function goToStep(nextStep, action) {
    var duration = Date.now() - stepEnterTs;
    if (window.Tracker) window.Tracker.logFormStep(currentStep, action, duration);
    currentStep = clampStep(nextStep);
    stepEnterTs = Date.now();
    showStep(currentStep);
    if (window.Tracker) window.Tracker.logFormStep(currentStep, 'enter', 0);
  }

  function flushAbandonIfNeeded() {
    if (!window.Tracker) return;
    if (!completed) {
      var duration = Date.now() - stepEnterTs;
      window.Tracker.logFormStep(currentStep, 'abandon', duration);
    }
    window.Tracker.flushNow();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.Tracker) {
      window.Tracker.init();
      window.Tracker.logFormStep(1, 'enter', 0);
    }

    document.getElementById('btn-next-1').addEventListener('click', function () {
      readStep1();
      var consentChecked = document.getElementById('field-consent').checked;
      if (!isStepValid(1, formData)) {
        alert('이름과 올바른 이메일을 입력해주세요.');
        return;
      }
      if (!consentChecked) {
        alert('개인정보 수집·이용에 동의해주세요.');
        return;
      }
      if (window.Tracker) {
        window.Tracker.setConsent(true);
        window.Tracker.setLeadData(formData);
      }
      goToStep(2, 'complete');
    });

    document.getElementById('btn-prev-2').addEventListener('click', function () {
      goToStep(1, 'return');
    });

    document.getElementById('btn-next-2').addEventListener('click', function () {
      readStep2();
      if (!isStepValid(2, formData)) {
        alert('문의 유형과 설명을 입력해주세요.');
        return;
      }
      if (window.Tracker) window.Tracker.setLeadData(formData);
      goToStep(3, 'complete');
      completed = true;
      if (window.Tracker) window.Tracker.flushNow();
    });

    showStep(1);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushAbandonIfNeeded();
  });
  window.addEventListener('pagehide', flushAbandonIfNeeded);
})();
