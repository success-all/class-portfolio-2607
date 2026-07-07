(function () {
  function filterProjects(projects, category) {
    if (category === 'all') return projects.slice();
    return projects.filter(function (project) {
      return project.category === category;
    });
  }

  function renderProjects(projects) {
    var grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    projects.forEach(function (project) {
      var card = document.createElement('div');
      card.className = 'project-card';
      card.setAttribute('data-project-id', project.id);
      card.innerHTML =
        '<div class="project-thumb project-thumb--' + project.category + '"></div>' +
        '<h3>' + project.title + '</h3>' +
        '<p>' + project.description + '</p>';
      card.addEventListener('click', function () {
        if (window.Tracker) {
          window.Tracker.logProjectClick(project.id);
          window.Tracker.flushNow();
        }
      });
      grid.appendChild(card);
    });
  }

  function setupFilters() {
    var buttons = document.querySelectorAll('[data-filter]');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        button.classList.add('active');
        var category = button.getAttribute('data-filter');
        if (window.Tracker) {
          window.Tracker.logFilterClick(category);
          window.Tracker.flushNow();
        }
        renderProjects(filterProjects(window.PROJECTS, category));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupFilters();
    renderProjects(window.PROJECTS);
    if (window.Tracker) window.Tracker.init();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && window.Tracker) window.Tracker.flushNow();
  });
  window.addEventListener('pagehide', function () {
    if (window.Tracker) window.Tracker.flushNow();
  });
})();
