// Configuration and API endpoints
const API_BASE_URL = "http://127.0.0.1:8000/api/v1"

const ENDPOINTS = {
  COURSE_TREE: `${API_BASE_URL}/course-tree`,
  COURSES: `${API_BASE_URL}/courses`,
  DEPARTMENTS: `${API_BASE_URL}/departments`,
}

// Authentication functions
function checkAuth() {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  
  if (!token || userRole !== 'admin') {
    clearAuthStorage();
    window.location.href = 'Login.html';
    return false;
  }
  return true;
}

// Function to clear authentication storage
function clearAuthStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userId');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userName');
}

// Function to handle logout
function logout() {
  console.log('Logging out admin user...');
  localStorage.clear(); // Clear all localStorage items
  window.location.href = 'Login.html';
}

// DOM elements
const elements = {
  courseTreeView: document.getElementById("courseTreeView"),
  departmentFilter: document.getElementById("departmentFilter"),
  levelFilter: document.getElementById("levelFilter"),
  courseSearch: document.getElementById("courseSearch"),
  searchButton: document.getElementById("searchButton"),
  expandAllBtn: document.getElementById("expandAllBtn"),
  collapseAllBtn: document.getElementById("collapseAllBtn"),
  loadingSpinner: document.getElementById("loadingSpinner"),
  editPrerequisitesForm: document.getElementById("editPrerequisitesForm"),
  editSemestersForm: document.getElementById("editSemestersForm"),
  editLevelForm: document.getElementById("editLevelForm"),
  successAlert: document.getElementById("successAlert"),
  errorAlert: document.getElementById("errorAlert"),
  successMessage: document.getElementById("successMessage"),
  errorMessage: document.getElementById("errorMessage"),
}

// State management
let courseData = []
let allCourses = []
let departments = []

// Utility functions
let loadingAlert = null;

function showLoading() {
  // Use SweetAlert2 if available
  if (typeof window.showLoading === 'function') {
    loadingAlert = window.showLoading('Loading course tree...');
  }
}

function hideLoading() {
  // Close SweetAlert loading if it was used
  if (typeof window.closeLoading === 'function' && loadingAlert) {
    window.closeLoading(loadingAlert);
    loadingAlert = null;
  }
  // Also try to close any SweetAlert loading even if loadingAlert is null (as a fallback)
  if (typeof window.Swal === 'function' && window.Swal.isVisible && window.Swal.isVisible()) {
    window.Swal.close();
  }
  // Hide the spinner in case it was left visible
  if (elements.loadingSpinner) {
    elements.loadingSpinner.style.display = "none";
  }
}

function showSuccessAlert(message) {
  // Use SweetAlert2 if available
  if (typeof window.showSuccess === 'function') {
    window.showSuccess(message);
    return;
  }
  
  // Fallback to the built-in alert
  elements.successMessage.textContent = message;
  elements.successAlert.style.display = "block";
  setTimeout(() => {
    elements.successAlert.style.display = "none";
  }, 3000);
}

function showErrorAlert(message) {
  // Use SweetAlert2 if available
  if (typeof window.showError === 'function') {
    window.showError(message);
    return;
  }
  
  // Fallback to the built-in alert
  elements.errorMessage.textContent = message;
  elements.errorAlert.style.display = "block";
  setTimeout(() => {
    elements.errorAlert.style.display = "none";
  }, 3000);
}

// Fetch data from API
async function fetchCourseTree(filters = {}) {
  showLoading()
  
  try {
    // Build query string from filters
    const queryParams = new URLSearchParams()
    if (filters.department_id) queryParams.append("department_id", filters.department_id)
    
    // FIXED: Better handling of level filtering to ensure consistent results
    if (filters.level !== null && filters.level !== undefined && filters.level !== "") {
      // Make sure we're always sending a proper numeric level to the API
      let levelValue = parseInt(filters.level, 10);
      if (!isNaN(levelValue)) {
        // Always ensure we're sending the level as 1, 2, 3, 4 format
        if (levelValue >= 100) {
          levelValue = Math.floor(levelValue / 100);
        }
        queryParams.append("level", levelValue.toString())
        console.log(`Adding level filter: ${levelValue}`);
      }
    }
    
    if (filters.search) queryParams.append("search", filters.search)
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ""

    console.log("Fetching course tree with filters:", filters, "Query string:", queryString);

    const response = await fetch(`${ENDPOINTS.COURSE_TREE}${queryString}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Failed with status ${response.status}: ${errorText}`)
      throw new Error(`Failed to fetch course tree: ${response.statusText}`)
    }

    const data = await response.json()
    courseData = data
    renderCourseTree(data)
  } catch (error) {
    console.error("Error fetching course tree:", error)
    elements.courseTreeView.innerHTML = `
            <div class="alert alert-danger">
                Failed to load course tree: ${error.message}
            </div>
        `
  } finally {
    hideLoading()
  }
}

async function fetchAllCourses() {
  try {
    const response = await fetch(ENDPOINTS.COURSES)
    if (!response.ok) {
      throw new Error(`Failed to fetch courses: ${response.statusText}`)
    }
    const data = await response.json()
    allCourses = data
    return data
  } catch (error) {
    console.error("Error fetching courses:", error)
    return []
  }
}

async function fetchDepartments() {
  try {
    const response = await fetch(ENDPOINTS.DEPARTMENTS)
    if (!response.ok) {
      throw new Error(`Failed to fetch departments: ${response.statusText}`)
    }
    const data = await response.json()
    departments = data
    return data
  } catch (error) {
    console.error("Error fetching departments:", error)
    return []
  }
}

// Render functions
function renderCourseTree(departments) {
  if (!departments || departments.length === 0) {
    elements.courseTreeView.innerHTML = "<p>No courses found.</p>"
    return
  }

  let html = ""

  departments.forEach((department) => {
    html += `
            <div class="department-section mb-4">
                <h6 class="department-title mb-3">${department.department_name}</h6>
                ${renderDepartmentCourses(department.courses)}
            </div>
        `
  })

  elements.courseTreeView.innerHTML = html

  // Attach event listeners to expand/collapse buttons
  setupExpandCollapseListeners()
}

function renderDepartmentCourses(courses) {
  if (!courses || courses.length === 0) {
    return "<p>No courses in this department.</p>"
  }

  let html = ""

  courses.forEach((course) => {
    html += renderCourseNode(course)
  })

  return html
}

function renderCourseNode(course) {
  // Get the complete course data including level from allCourses if available
  const completeData = allCourses.find(c => c.course_id === course.course_id) || course;
  
  // Use the level from completeData if available
  const levelValue = completeData.level !== undefined ? completeData.level : undefined;
  
  // Create semester badges
  const semesterBadges = renderSemesterBadges(course.semesters || []);
  
  // Create level badge - pass the level property if available
  const levelBadge = renderLevelBadge(course.course_id, levelValue);

  const prerequisitesIndicator =
    course.prerequisites && course.prerequisites.length > 0
      ? `<span class="prerequisite-indicator">Requires: ${course.prerequisites.join(", ")}</span>`
      : "";

  let html = `
        <div class="tree-node" data-course-id="${course.course_id}">
            <div class="d-flex justify-content-between">
                <div>
                    <strong>${course.course_id}: ${course.name}</strong>
                    ${prerequisitesIndicator}
                    ${semesterBadges}
                    ${levelBadge}
                </div>
                <div class="d-flex align-items-center">
                    <div class="actions-dropdown me-2">
                        <button class="btn btn-sm btn-outline-secondary">Actions</button>
                        <div class="actions-dropdown-content">
                            <a href="#" class="edit-prerequisites" data-course-id="${course.course_id}">Edit Prerequisites</a>
                            <a href="#" class="edit-semesters" data-course-id="${course.course_id}">Edit Semesters</a>
                            <a href="#" class="edit-level" data-course-id="${course.course_id}">Edit Level</a>
                            <a href="#" class="validate-course" data-course-id="${course.course_id}">Validate Prerequisites</a>
                        </div>
                    </div>
                    ${
                      course.children && course.children.length > 0
                        ? `<button class="btn btn-sm btn-outline-primary expand-btn" data-course-id="${course.course_id}">+</button>`
                        : ""
                    }
                </div>
            </div>
    `;

  // Add child courses if any
  if (course.children && course.children.length > 0) {
    html += `
            <div class="child-courses mt-2" style="display: none;">
                ${course.children.map((child) => renderCourseNode(child)).join("")}
            </div>
        `;
  }

  html += "</div>";

  return html;
}

function renderSemesterBadges(semesters) {
  if (!semesters || semesters.length === 0) {
    return '<span class="semester-badge all">TBD</span>'
  }

  return semesters
    .map((semester) => {
      const semesterClass = semester.toLowerCase()
      return `<span class="semester-badge ${semesterClass}">${semester}</span>`
    })
    .join("")
}

// Fixed level badge to show only "Level X" without the number in parentheses
function renderLevelBadge(courseId, level) {
  // First try to use the explicitly provided level
  let levelNumber = level;
  
  // If no explicit level is provided, try to extract from course ID
  if (levelNumber === undefined || levelNumber === null) {
    const extractedLevel = extractLevelFromCourseId(courseId);
    if (extractedLevel !== null) {
      levelNumber = Math.floor(extractedLevel / 100);
    }
  }
  
  if (!levelNumber) return '';
  
  // Display only "Level X" without the number in parentheses
  return `<span class="level-badge">Level ${levelNumber}</span>`;
}

// FIXED: Improved level extraction from course ID
function extractLevelFromCourseId(courseId) {
  if (!courseId) return null;
  
  // Match the first 3 consecutive digits in the course ID
  const match = courseId.match(/\d{3}/);
  if (match) {
    return parseInt(match[0], 10); // Return the full 3-digit number with explicit base 10
  }
  
  // Fallback to single-digit level codes if no 3-digit sequence found
  const singleDigitMatch = courseId.match(/\d/);
  return singleDigitMatch ? parseInt(singleDigitMatch[0], 10) * 100 : null;
}

// FIXED: Update level filter options to display as "Level X" but value as X
function populateLevelFilter() {
  const select = elements.levelFilter;
  select.innerHTML = '<option value="">All Levels</option>';
  
  // Add Level 1-4 options
  for (let i = 1; i <= 4; i++) {
    const option = document.createElement("option");
    option.value = i.toString(); // Store as 1, 2, 3, 4
    option.textContent = `Level ${i}`; // Display as "Level 1", "Level 2", etc.
    select.appendChild(option);
  }
}

// Simplified level modal options to show only "Level X" 
function updateLevelModalOptions() {
  const levelSelect = document.getElementById("editCourseLevel");
  levelSelect.innerHTML = '';
  
  // Add options for levels 1-4
  for (let i = 1; i <= 4; i++) {
    const option = new Option(`Level ${i}`, i.toString());
    levelSelect.add(option);
  }
}

function populateDepartmentFilter(departments) {
  const select = elements.departmentFilter
  select.innerHTML = '<option value="">All Departments</option>'

  departments.forEach((department) => {
    const option = document.createElement("option")
    option.value = department.department_id
    option.textContent = department.name
    select.appendChild(option)
  })
}

function populatePrerequisitesSelect(courses, selectId, currentCourseId = null) {
  const select = document.getElementById(selectId)
  select.innerHTML = ""

  courses.forEach((course) => {
    // Skip the current course to prevent self-reference
    if (currentCourseId && course.course_id === currentCourseId) {
      return
    }

    const option = document.createElement("option")
    option.value = course.course_id
    option.textContent = `${course.course_id}: ${course.name}`
    select.appendChild(option)
  })
}

// Event handlers
function setupExpandCollapseListeners() {
  // Expand/collapse individual course nodes
  document.querySelectorAll(".expand-btn").forEach((button) => {
    button.addEventListener("click", function () {
      const parentNode = this.closest(".tree-node")
      const childCourses = parentNode.querySelector(".child-courses")

      if (childCourses) {
        if (childCourses.style.display === "none" || !childCourses.style.display) {
          childCourses.style.display = "block"
          this.textContent = "-"
        } else {
          childCourses.style.display = "none"
          this.textContent = "+"
        }
      }
    })
  })

  // Edit prerequisites buttons
  document.querySelectorAll(".edit-prerequisites").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault()
      const courseId = this.getAttribute("data-course-id")
      openEditPrerequisitesModal(courseId)
    })
  })

  // Edit semesters buttons
  document.querySelectorAll(".edit-semesters").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault()
      const courseId = this.getAttribute("data-course-id")
      openEditSemestersModal(courseId)
    })
  })
  
  // Edit level buttons
  document.querySelectorAll(".edit-level").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault()
      const courseId = this.getAttribute("data-course-id")
      openEditLevelModal(courseId)
    })
  })

  // Validate course buttons
  document.querySelectorAll(".validate-course").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault()
      const courseId = this.getAttribute("data-course-id")
      validateCoursePrerequisites(courseId)
    })
  })
}

function setupEventListeners() {
  // Expand all button
  elements.expandAllBtn.addEventListener("click", () => {
    const allChildCourses = document.querySelectorAll(".child-courses")
    const allExpandButtons = document.querySelectorAll(".expand-btn")

    allChildCourses.forEach((node) => {
      node.style.display = "block"
    })

    allExpandButtons.forEach((button) => {
      button.textContent = "-"
    })
  })

  // Collapse all button
  elements.collapseAllBtn.addEventListener("click", () => {
    const allChildCourses = document.querySelectorAll(".child-courses")
    const allExpandButtons = document.querySelectorAll(".expand-btn")

    allChildCourses.forEach((node) => {
      node.style.display = "none"
    })

    allExpandButtons.forEach((button) => {
      button.textContent = "+"
    })
  })

  // Department filter
  elements.departmentFilter.addEventListener("change", function () {
    const filters = {
      department_id: this.value,
      level: elements.levelFilter.value,
      search: elements.courseSearch.value,
    }
    fetchCourseTree(filters)
  })

  // FIXED: Improved level filter event listener to ensure consistent filtering
  elements.levelFilter.addEventListener("change", function () {
    const levelValue = this.value;
    console.log(`Level filter changed to: ${levelValue}`);
    
    const filters = {
      department_id: elements.departmentFilter.value,
      level: levelValue,
      search: elements.courseSearch.value,
    }
    fetchCourseTree(filters)
  })

  // Search button
  elements.searchButton.addEventListener("click", () => {
    const filters = {
      department_id: elements.departmentFilter.value,
      level: elements.levelFilter.value,
      search: elements.courseSearch.value,
    }
    fetchCourseTree(filters)
  })

  // Search input - Enter key
  elements.courseSearch.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      elements.searchButton.click()
    }
  })

  // Edit prerequisites form
  elements.editPrerequisitesForm.addEventListener("submit", (e) => {
    e.preventDefault()
    handleEditPrerequisites()
  })

  // Edit semesters form
  elements.editSemestersForm.addEventListener("submit", (e) => {
    e.preventDefault()
    handleEditSemesters()
  })
  
  // Edit level form
  elements.editLevelForm.addEventListener("submit", (e) => {
    e.preventDefault()
    handleEditLevel()
  })
}

// Modal functions
// Find the existing openEditPrerequisitesModal function and replace it with this:
function openEditPrerequisitesModal(courseId) {
  const course = findCourseById(courseId)
  if (!course) return

  // Set course ID in the form
  document.getElementById("editCourseId").value = courseId

  // Get the modal body element
  const modalBody = document.querySelector("#editPrerequisitesModal .modal-body")
  
  // Update the modal content with separate lists for current prerequisites and available courses
  modalBody.innerHTML = `
    <form id="editPrerequisitesForm">
      <input type="hidden" id="editCourseId" value="${courseId}">
      
      <div class="mb-3">
        <h6>Current Prerequisites</h6>
        <div id="currentPrerequisitesList" class="list-group mb-3">
          ${renderCurrentPrerequisites(course)}
        </div>
      </div>
      
      <div class="mb-3">
        <h6>Available Courses</h6>
        <div class="input-group mb-2">
          <input type="text" id="availableCourseSearch" class="form-control" placeholder="Search courses...">
          <button class="btn btn-outline-secondary" type="button" id="searchAvailableCourses">Search</button>
        </div>
        <div id="availableCoursesList" class="list-group" style="max-height: 200px; overflow-y: auto;">
          ${renderAvailableCourses(course)}
        </div>
      </div>
    </form>
  `

  // Add event listeners for the newly created elements
  setupPrerequisiteModalListeners(courseId)

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("editPrerequisitesModal"))
  modal.show()
}

// New function to render current prerequisites
function renderCurrentPrerequisites(course) {
  if (!course.prerequisites || course.prerequisites.length === 0) {
    return '<div class="text-muted">No prerequisites for this course.</div>'
  }

  let html = ''
  course.prerequisites.forEach(prereqId => {
    const prereqCourse = allCourses.find(c => c.course_id === prereqId)
    if (prereqCourse) {
      html += `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          ${prereqCourse.course_id}: ${prereqCourse.name}
          <button type="button" class="btn btn-sm btn-danger remove-prerequisite" data-prereq-id="${prereqCourse.course_id}">
            Remove
          </button>
        </div>
      `
    }
  })
  return html
}

// New function to render available courses to add as prerequisites
function renderAvailableCourses(course) {
  // Filter out the current course and existing prerequisites
  const availableCourses = allCourses.filter(c => 
    c.course_id !== course.course_id && 
    (!course.prerequisites || !course.prerequisites.includes(c.course_id))
  )

  if (availableCourses.length === 0) {
    return '<div class="text-muted">No available courses to add.</div>'
  }

  let html = ''
  availableCourses.forEach(availCourse => {
    html += `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        ${availCourse.course_id}: ${availCourse.name}
        <button type="button" class="btn btn-sm btn-primary add-prerequisite" data-course-id="${availCourse.course_id}">
          Add
        </button>
      </div>
    `
  })
  return html
}

// New function to set up event listeners for the prerequisite modal
function setupPrerequisiteModalListeners(courseId) {
  // Event handlers for remove prerequisite buttons
  document.querySelectorAll('.remove-prerequisite').forEach(button => {
    button.addEventListener('click', async function() {
      const prereqId = this.getAttribute('data-prereq-id')
      await removePrerequisite(courseId, prereqId)
      
      // Update the lists
      const course = findCourseById(courseId)
      document.getElementById('currentPrerequisitesList').innerHTML = renderCurrentPrerequisites(course)
      document.getElementById('availableCoursesList').innerHTML = renderAvailableCourses(course)
      
      // Re-attach event listeners
      setupPrerequisiteModalListeners(courseId)
    })
  })

  // Event handlers for add prerequisite buttons
  document.querySelectorAll('.add-prerequisite').forEach(button => {
    button.addEventListener('click', async function() {
      const prereqId = this.getAttribute('data-course-id')
      await addPrerequisite(courseId, prereqId)
      
      // Update the lists
      const course = findCourseById(courseId)
      document.getElementById('currentPrerequisitesList').innerHTML = renderCurrentPrerequisites(course)
      document.getElementById('availableCoursesList').innerHTML = renderAvailableCourses(course)
      
      // Re-attach event listeners
      setupPrerequisiteModalListeners(courseId)
    })
  })

  // Search available courses
  const searchInput = document.getElementById('availableCourseSearch')
  const searchButton = document.getElementById('searchAvailableCourses')
  
  if (searchButton) {
    searchButton.addEventListener('click', function() {
      filterAvailableCourses(courseId, searchInput.value)
    })
  }
  
  if (searchInput) {
    searchInput.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') {
        filterAvailableCourses(courseId, this.value)
      }
    })
  }
}

// Filter available courses based on search input
function filterAvailableCourses(courseId, searchTerm) {
  const course = findCourseById(courseId)
  if (!course) return
  
  const filteredCourses = allCourses.filter(c => 
    c.course_id !== course.course_id && 
    (!course.prerequisites || !course.prerequisites.includes(c.course_id)) &&
    (c.course_id.toLowerCase().includes(searchTerm.toLowerCase()) || 
     c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  )
  
  const availableList = document.getElementById('availableCoursesList')
  
  if (filteredCourses.length === 0) {
    availableList.innerHTML = '<div class="text-muted">No matching courses found.</div>'
    return
  }
  
  let html = ''
  filteredCourses.forEach(c => {
    html += `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        ${c.course_id}: ${c.name}
        <button type="button" class="btn btn-sm btn-primary add-prerequisite" data-course-id="${c.course_id}">
          Add
        </button>
      </div>
    `
  })
  
  availableList.innerHTML = html
  
  // Re-attach event listeners for the new buttons
  document.querySelectorAll('.add-prerequisite').forEach(button => {
    button.addEventListener('click', async function() {
      const prereqId = this.getAttribute('data-course-id')
      await addPrerequisite(courseId, prereqId)
      
      // Update the lists
      const updatedCourse = findCourseById(courseId)
      document.getElementById('currentPrerequisitesList').innerHTML = renderCurrentPrerequisites(updatedCourse)
      filterAvailableCourses(courseId, searchTerm) // Refresh with the same filter
    })
  })
}

// Function to add a prerequisite
async function addPrerequisite(courseId, prereqId) {
  try {
    const response = await fetch(`${ENDPOINTS.COURSE_TREE}/${courseId}/prerequisites/${prereqId}`, {
      method: "POST",
    })

    if (!response.ok) {
      const errorData = await response.json()
      showErrorAlert(errorData.detail || `Failed to add prerequisite ${prereqId}`)
      return false
    }

    // Update the course object in our local data
    const course = findCourseById(courseId)
    if (course) {
      if (!course.prerequisites) {
        course.prerequisites = []
      }
      if (!course.prerequisites.includes(prereqId)) {
        course.prerequisites.push(prereqId)
      }
    }

    // Update UI immediately
    refreshCourseNodeDisplay(courseId)
    
    showSuccessAlert(`Prerequisite added successfully!`)
    return true
  } catch (error) {
    console.error("Error adding prerequisite:", error)
    showErrorAlert(error.message)
    return false
  }
}

// Function to remove a prerequisite
async function removePrerequisite(courseId, prereqId) {
  try {
    const response = await fetch(`${ENDPOINTS.COURSE_TREE}/${courseId}/prerequisites/${prereqId}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const errorData = await response.json()
      showErrorAlert(errorData.detail || `Failed to remove prerequisite ${prereqId}`)
      return false
    }

    // Update the course object in our local data
    const course = findCourseById(courseId)
    if (course && course.prerequisites) {
      course.prerequisites = course.prerequisites.filter(id => id !== prereqId)
    }
    
    // Update UI immediately
    refreshCourseNodeDisplay(courseId)
    
    showSuccessAlert(`Prerequisite removed successfully!`)
    return true
  } catch (error) {
    console.error("Error removing prerequisite:", error)
    showErrorAlert(error.message)
    return false
  }
}

// Add this function to refresh the course display after prerequisite changes
function refreshCourseNodeDisplay(courseId) {
  const course = findCourseById(courseId);
  if (!course) return;
  
  // Find the course node in the DOM
  const courseNode = document.querySelector(`.tree-node[data-course-id="${courseId}"]`);
  if (!courseNode) return;
  
  // Update the prerequisite indicator
  let prereqIndicator = courseNode.querySelector('.prerequisite-indicator');
  if (course.prerequisites && course.prerequisites.length > 0) {
    const prereqText = `Requires: ${course.prerequisites.join(", ")}`;
    if (prereqIndicator) {
      prereqIndicator.textContent = prereqText;
    } else {
      // Create new indicator if it doesn't exist
      prereqIndicator = document.createElement('span');
      prereqIndicator.className = 'prerequisite-indicator';
      prereqIndicator.textContent = prereqText;
      
      // Insert after the course name
      const courseName = courseNode.querySelector('strong');
      if (courseName) {
        courseName.insertAdjacentElement('afterend', prereqIndicator);
      }
    }
  } else if (prereqIndicator) {
    // Remove the indicator if no prerequisites
    prereqIndicator.remove();
  }
}

function openEditSemestersModal(courseId) {
  const course = findCourseById(courseId)
  if (!course) return

  // Set course ID in the form
  document.getElementById("editSemestersCourseId").value = courseId

  // Reset checkboxes
  document.getElementById("editFallSemester").checked = false
  document.getElementById("editSpringSemester").checked = false
  document.getElementById("editSummerSemester").checked = false

  // Select current semesters
  if (course.semesters && course.semesters.length > 0) {
    course.semesters.forEach((semester) => {
      const checkbox = document.getElementById(`edit${semester}Semester`)
      if (checkbox) {
        checkbox.checked = true
      }
    })
  }

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("editSemestersModal"))
  modal.show()
}

// Simplified openEditLevelModal for easier level selection
function openEditLevelModal(courseId) {
  const course = findCourseById(courseId);
  if (!course) return;

  // Set course ID in the form
  document.getElementById("editLevelCourseId").value = courseId;
  
  // Update options first
  updateLevelModalOptions();
  
  // Get the level select element
  const levelSelect = document.getElementById("editCourseLevel");
  
  // Get current level value
  let currentLevel = null;
  
  // First check if course has a level property directly
  if (course.level !== undefined && course.level !== null) {
    currentLevel = course.level.toString();
  } 
  // Try to find the complete course data in allCourses array
  else {
    const completeCourse = allCourses.find(c => c.course_id === courseId);
    if (completeCourse && completeCourse.level !== undefined && completeCourse.level !== null) {
      currentLevel = completeCourse.level.toString();
    }
    // Otherwise try to extract from course ID as fallback
    else {
      const extractedLevel = extractLevelFromCourseId(course.course_id);
      if (extractedLevel !== null) {
        currentLevel = Math.floor(extractedLevel / 100).toString();
      }
    }
  }
  
  // Set the level select value
  levelSelect.value = currentLevel;
  
  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("editLevelModal"));
  modal.show();
}

// Helper functions
function findCourseById(courseId) {
  // First try to find in allCourses as it may have more complete data
  let foundCourse = allCourses.find((course) => course.course_id === courseId);
  if (foundCourse) return foundCourse;
  
  // If not found in allCourses, search in courseData structure
  foundCourse = null;

  // Search function to recursively look through the course tree
  function searchInCourses(courses) {
    if (!courses || !Array.isArray(courses)) return false;
    
    for (const course of courses) {
      if (course.course_id === courseId) {
        foundCourse = course;
        return true;
      }

      if (course.children && course.children.length > 0) {
        if (searchInCourses(course.children)) {
          return true;
        }
      }
    }
    return false;
  }

  // Search through each department's courses
  if (Array.isArray(courseData)) {
    for (const department of courseData) {
      if (department.courses && searchInCourses(department.courses)) {
        break;
      }
    }
  }

  return foundCourse;
}


// Fixed handleEditLevel to update the UI immediately after saving
// Fixed handleEditLevel to update the UI immediately after saving
async function handleEditLevel() {
  try {
    const courseId = document.getElementById("editLevelCourseId").value;
    const levelValue = document.getElementById("editCourseLevel").value;
    
    // We now store the level value directly (1-4)
    const newLevel = parseInt(levelValue, 10);
    
    console.log("Updating course", courseId, "with level:", newLevel);
    
    const courseData = {
      level: newLevel
    };
    
    // Get the full course object to include other required fields
    const existingCourse = allCourses.find(c => c.course_id === courseId);
    if (existingCourse) {
      // Include all required fields from the course module
      courseData.name = existingCourse.name;
      courseData.description = existingCourse.description;
      courseData.credit_hours = existingCourse.credit_hours;
      courseData.department_id = existingCourse.department_id;
      courseData.semesters = existingCourse.semesters || [];
    }
    
    // Make API call to update the level
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseData)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to update course level");
    }
    
    // Update the course in our local data
    const updatedCourse = await response.json();
    
    // Update the course in allCourses array
    const courseIndex = allCourses.findIndex(c => c.course_id === courseId);
    if (courseIndex !== -1) {
      allCourses[courseIndex] = {...allCourses[courseIndex], level: newLevel};
    }
    
    // Update course in courseData tree structure
    function updateCourseInTree(courses) {
      if (!courses || !Array.isArray(courses)) return false;
      
      for (let i = 0; i < courses.length; i++) {
        if (courses[i].course_id === courseId) {
          courses[i].level = newLevel;
          return true;
        }
        
        if (courses[i].children && courses[i].children.length > 0) {
          if (updateCourseInTree(courses[i].children)) {
            return true;
          }
        }
      }
      return false;
    }
    
    // Update courseData properly
    if (Array.isArray(courseData)) {
      courseData.forEach(department => {
        if (department.courses && Array.isArray(department.courses)) {
          updateCourseInTree(department.courses);
        }
      });
    }
    
    // Update the UI to show the new level - improved method
    const courseElement = document.querySelector(`.tree-node[data-course-id="${courseId}"]`);
    if (courseElement) {
      // Look for the level badge
      let levelBadge = courseElement.querySelector('.level-badge');
      
      // If not found, create a new one
      if (!levelBadge) {
        levelBadge = document.createElement('span');
        levelBadge.className = 'level-badge';
        
        // Find the right place to insert it
        const badgeContainer = courseElement.querySelector('div > div:first-child');
        if (badgeContainer) {
          // Insert after semester badges if they exist
          const lastSemesterBadge = badgeContainer.querySelector('.semester-badge:last-of-type');
          if (lastSemesterBadge) {
            lastSemesterBadge.insertAdjacentElement('afterend', levelBadge);
          } else {
            // Otherwise insert after the prerequisite indicator or course name
            const prereqIndicator = badgeContainer.querySelector('.prerequisite-indicator');
            if (prereqIndicator) {
              prereqIndicator.insertAdjacentElement('afterend', levelBadge);
            } else {
              const courseName = badgeContainer.querySelector('strong');
              if (courseName) {
                courseName.insertAdjacentElement('afterend', levelBadge);
              } else {
                badgeContainer.appendChild(levelBadge);
              }
            }
          }
        }
      }
      
      // Update the badge text
      if (levelBadge) {
        levelBadge.textContent = `Level ${newLevel}`;
      }
    }
    
    // Show success message
    showSuccessAlert("Course level updated successfully!");
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById("editLevelModal"));
    modal.hide();
    
  } catch (error) {
    console.error("Error updating level:", error);
    showErrorAlert(error.message);
  }
}

async function handleEditSemesters() {
  try {
    const courseId = document.getElementById("editSemestersCourseId").value;
    const fallChecked = document.getElementById("editFallSemester").checked;
    const springChecked = document.getElementById("editSpringSemester").checked;
    const summerChecked = document.getElementById("editSummerSemester").checked;

    const newSemesters = [];
    if (fallChecked) newSemesters.push("Fall");
    if (springChecked) newSemesters.push("Spring");
    if (summerChecked) newSemesters.push("Summer");

    // Get the full course object to include other required fields
    const existingCourse = allCourses.find(c => c.course_id === courseId);
    if (!existingCourse) {
      throw new Error("Course not found");
    }

    const courseData = {
      name: existingCourse.name,
      description: existingCourse.description,
      credit_hours: existingCourse.credit_hours,
      department_id: existingCourse.department_id,
      level: existingCourse.level,
      semesters: newSemesters
    };

    // Make API call to update the course
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Failed to update course semesters");
    }

    // Update the course in our local data
    const updatedCourse = await response.json();

    // Update the course in allCourses array
    const courseIndex = allCourses.findIndex(c => c.course_id === courseId);
    if (courseIndex !== -1) {
      allCourses[courseIndex] = {...allCourses[courseIndex], semesters: newSemesters};
    }

    // Update course in courseData structure
    function updateCourseInTree(courses) {
      if (!courses || !Array.isArray(courses)) return false;
      
      for (let i = 0; i < courses.length; i++) {
        if (courses[i].course_id === courseId) {
          courses[i].semesters = newSemesters;
          return true;
        }
        
        if (courses[i].children && courses[i].children.length > 0) {
          if (updateCourseInTree(courses[i].children)) {
            return true;
          }
        }
      }
      return false;
    }

    // Update courseData properly
    if (Array.isArray(courseData)) {
      courseData.forEach(department => {
        if (department.courses && Array.isArray(department.courses)) {
          updateCourseInTree(department.courses);
        }
      });
    }

    // Update the UI to show the new semesters
    const courseElement = document.querySelector(`.tree-node[data-course-id="${courseId}"]`);
    if (courseElement) {
      // Remove existing semester badges
      courseElement.querySelectorAll('.semester-badge').forEach(badge => badge.remove());
      
      // Add new semester badges
      const semesterBadgesHTML = renderSemesterBadges(newSemesters);
      
      // Find the right place to insert the badges
      const prereqIndicator = courseElement.querySelector('.prerequisite-indicator');
      if (prereqIndicator) {
        prereqIndicator.insertAdjacentHTML('afterend', semesterBadgesHTML);
      } else {
        const courseName = courseElement.querySelector('strong');
        if (courseName) {
          courseName.insertAdjacentHTML('afterend', semesterBadgesHTML);
        }
      }
    }

    // Show success message
    showSuccessAlert("Course semesters updated successfully!");

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById("editSemestersModal"));
    modal.hide();

  } catch (error) {
    console.error("Error updating semesters:", error);
    showErrorAlert(error.message);
  }
}

async function validateCoursePrerequisites(courseId) {
  try {
    const response = await fetch(`${ENDPOINTS.COURSE_TREE}/validate/${courseId}`)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail || "Failed to validate prerequisites")
    }

    const data = await response.json()

    if (data.valid) {
      showSuccessAlert("Prerequisites validation successful: No circular dependencies found.")
    } else {
      showErrorAlert("Prerequisites validation failed: " + data.message)
    }
  } catch (error) {
    console.error("Error validating prerequisites:", error)
    showErrorAlert(error.message)
  }
}

// Initialization
async function initializeApp() {
  try {
    // Check authentication first
    if (!checkAuth()) {
      return;
    }
    
    // Set up logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        logout();
      });
    }
    
    // Fetch departments and courses
    const [departmentsData, coursesData] = await Promise.all([fetchDepartments(), fetchAllCourses()])

    // Populate department filters
    populateDepartmentFilter(departmentsData)
    
    // ADDED: Populate level filter
    populateLevelFilter()
    
    // Setup event listeners
    setupEventListeners()
    
    // Fetch course tree initially without filters
    await fetchCourseTree()
    
    // Log success
    console.log("Application initialized successfully with", coursesData.length, "courses and", departmentsData.length, "departments");
  } catch (error) {
    console.error("Error initializing app:", error)
    showErrorAlert("Failed to initialize application. Please refresh the page and try again.")
  }
}

// Start the application when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", initializeApp)