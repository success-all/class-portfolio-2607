(function () {
  var MAX_STEP = 3;
  var currentStep = 1;

  function clampStep(step) {
    return Math.min(MAX_STEP, Math.max(1, step));
  }

  function isStepValid(step, formData) {
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (step === 1) {
      return Boolean(formData.name && formData.name.trim() && EMAIL_RE.test(formData.email || ''));
    }
    if (step === 2) {
      return Boolean(formData.projectType && formData.description && formData.description.trim());
    }
    return true;
  }

  function readFormData() {
    return {
      name: document.getElementById('field-name').value,
      email: document.getElementById('field-email').value,
      projectType: document.getElementById('field-project-type').value,
      description: document.getElementById('field-description').value
    };
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

  function goToStep(nextStep) {
    currentStep = clampStep(nextStep);
    showStep(currentStep);
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('btn-next-1').addEventListener('click', function () {
      if (!isStepValid(1, readFormData())) {
        alert('이름과 올바른 이메일을 입력해주세요.');
        return;
      }
      goToStep(2);
    });

    document.getElementById('btn-prev-2').addEventListener('click', function () {
      goToStep(1);
    });

    document.getElementById('btn-next-2').addEventListener('click', function () {
      if (!isStepValid(2, readFormData())) {
        alert('문의 유형과 설명을 입력해주세요.');
        return;
      }
      goToStep(3);
    });

    showStep(1);
  });
})();
