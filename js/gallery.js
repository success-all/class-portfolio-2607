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
      card.innerHTML =
        '<div class="project-thumb project-thumb--' + project.category + '"></div>' +
        '<h3>' + project.title + '</h3>' +
        '<p>' + project.description + '</p>';
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
        renderProjects(filterProjects(window.PROJECTS, category));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupFilters();
    renderProjects(window.PROJECTS);
  });
})();
