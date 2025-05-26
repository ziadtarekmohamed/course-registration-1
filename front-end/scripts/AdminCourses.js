const API_BASE_URL = "http://127.0.0.1:8000/api/v1"

// Check if user is logged in and is an admin
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

// Fetch departments and populate dropdowns
async function loadDepartments() {
  try {
    const response = await fetch(`${API_BASE_URL}/departments/`)
    if (!response.ok) throw new Error("Failed to fetch departments")

    const departments = await response.json()
    const addDepartmentSelect = document.getElementById("department")
    const editDepartmentSelect = document.getElementById("edit_department")

    const departmentOptions =
      '<option value="">Select Department</option>' +
      departments.map((dept) => `<option value="${dept.department_id}">${dept.name}</option>`).join("")

    addDepartmentSelect.innerHTML = departmentOptions
    editDepartmentSelect.innerHTML = departmentOptions
  } catch (error) {
    console.error("Error loading departments:", error)
    alert("Error loading departments. Please try again.")
  }
}

// Load all courses for prerequisites dropdown
async function loadCoursesForPrerequisites() {
  try {
    const response = await fetch(`${API_BASE_URL}/courses/`)
    if (!response.ok) throw new Error("Failed to fetch courses")

    const courses = await response.json()

    // Get both prerequisite select elements (add and edit forms)
    const addPrerequisitesSelect = document.getElementById("prerequisitesSelect")
    const editPrerequisitesSelect = document.getElementById("edit_prerequisitesSelect")

    const courseOptions = courses
      .map((course) => `<option value="${course.course_id}">${course.course_id}: ${course.name}</option>`)
      .join("")

    // Update both dropdowns if they exist
    if (addPrerequisitesSelect) {
      addPrerequisitesSelect.innerHTML = courseOptions
    }

    if (editPrerequisitesSelect) {
      editPrerequisitesSelect.innerHTML = courseOptions
    }
  } catch (error) {
    console.error("Error loading courses for prerequisites:", error)
    // Update both dropdowns with error message
    const errorOption = '<option value="">Error loading courses</option>'

    const addPrerequisitesSelect = document.getElementById("prerequisitesSelect")
    const editPrerequisitesSelect = document.getElementById("edit_prerequisitesSelect")

    if (addPrerequisitesSelect) {
      addPrerequisitesSelect.innerHTML = errorOption
    }

    if (editPrerequisitesSelect) {
      editPrerequisitesSelect.innerHTML = errorOption
    }
  }
}

// Load courses and display in table
async function loadCourses() {
  try {
    const response = await fetch(`${API_BASE_URL}/courses/`)
    if (!response.ok) throw new Error("Failed to fetch courses")

    const courses = await response.json()
    const courseTableBody = document.getElementById("courseTableBody")
    courseTableBody.innerHTML = ""

    courses.forEach((course) => {
      const row = document.createElement("tr")
      row.innerHTML = `
                <td>${course.course_id || "N/A"}</td>
                <td>${course.name || "N/A"}</td>
                <td>${course.description || "N/A"}</td>
                <td>${course.credit_hours || "N/A"}</td>
                <td>${course.department_name || "Unknown"}</td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            Actions
                        </button>
                        <ul class="dropdown-menu">
                            <li><a class="dropdown-item edit-course" href="#" data-id="${course.course_id}">Edit</a></li>
                            <li><a class="dropdown-item delete-course text-danger" href="#" data-id="${course.course_id}">Delete</a></li>
                        </ul>
                    </div>
                </td>
            `
      courseTableBody.appendChild(row)
    })
    attachEventListeners()
  } catch (error) {
    console.error("Error loading courses:", error)
    alert("Error loading courses. Please try again.")
  }
}

// Attach event listeners to edit & delete buttons
function attachEventListeners() {
  document.querySelectorAll(".edit-course").forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault()
      const courseId = this.dataset.id
      openEditModal(courseId)
    })
  })

  document.querySelectorAll(".delete-course").forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault()
      const courseId = this.dataset.id
      if (confirm("Are you sure you want to delete this course?")) {
        deleteCourse(courseId)
      }
    })
  })
}

// Helper function to get selected semesters from checkboxes
function getSelectedSemesters(prefix = "") {
  const semesters = []
  if (document.getElementById(prefix + "semesterFall").checked) semesters.push("Fall")
  if (document.getElementById(prefix + "semesterSpring").checked) semesters.push("Spring")
  if (document.getElementById(prefix + "semesterSummer").checked) semesters.push("Summer")
  return semesters
}

// Set semester checkboxes based on course data
function setSemesterCheckboxes(semesters = [], prefix = "edit_") {
  document.getElementById(prefix + "semesterFall").checked = semesters.includes("Fall")
  document.getElementById(prefix + "semesterSpring").checked = semesters.includes("Spring")
  document.getElementById(prefix + "semesterSummer").checked = semesters.includes("Summer")
}

// Helper function to get selected prerequisites
function getSelectedPrerequisites(selectId) {
  const select = document.getElementById(selectId)
  const selectedOptions = Array.from(select.selectedOptions)
  return selectedOptions.map((option) => option.value)
}

// Set selected prerequisites in the dropdown
function setSelectedPrerequisites(prerequisites = [], selectId) {
  const select = document.getElementById(selectId)
  if (!select) return

  // Clear previous selections
  Array.from(select.options).forEach((option) => {
    option.selected = false
  })

  // Set new selections
  prerequisites.forEach((prereqId) => {
    const option = Array.from(select.options).find((opt) => opt.value === prereqId)
    if (option) {
      option.selected = true
    }
  })
}

// Open edit modal and populate fields
async function openEditModal(courseId) {
  try {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`)
    if (!response.ok) throw new Error("Course not found")

    const course = await response.json()

    document.getElementById("editForm").setAttribute("data-course-id", course.course_id)

    document.getElementById("edit_courseTitle").value = course.name
    document.getElementById("edit_courseDescription").value = course.description
    document.getElementById("edit_creditHours").value = course.credit_hours
    document.getElementById("edit_department").value = course.department_id
    document.getElementById("edit_level").value = course.level || ""

    // Set semester checkboxes
    setSemesterCheckboxes(course.semesters || [])

    // Set prerequisites if they exist
    if (course.prerequisites && Array.isArray(course.prerequisites)) {
      setSelectedPrerequisites(course.prerequisites, "edit_prerequisitesSelect")
    }

    const editModal = new bootstrap.Modal(document.getElementById("editModal"))
    editModal.show()
  } catch (error) {
    console.error("Error fetching course details:", error)
    alert("Error fetching course details. Please try again.")
  }
}

// Handle course creation
document.getElementById("courseForm").addEventListener("submit", async (event) => {
  event.preventDefault()

  // Validate required fields
  const name = document.getElementById("courseTitle").value.trim()
  const description = document.getElementById("courseDescription").value.trim()
  const creditHours = Number.parseInt(document.getElementById("creditHours").value)
  const departmentId = document.getElementById("department").value
  const level = Number.parseInt(document.getElementById("level").value)
  const semesters = getSelectedSemesters("")
  const prerequisites = getSelectedPrerequisites("prerequisitesSelect")

  // Validation
  if (!name || name.length < 3 || name.length > 100) {
    alert("Course name must be between 3 and 100 characters")
    return
  }

  if (!description || description.length < 10 || description.length > 500) {
    alert("Course description must be between 10 and 500 characters")
    return
  }

  if (!creditHours || creditHours < 1 || creditHours > 4) {
    alert("Credit hours must be between 1 and 4")
    return
  }

  if (!departmentId) {
    alert("Please select a department")
    return
  }

  if (!level || level < 1 || level > 4) {
    alert("Level must be between 1 and 4")
    return
  }

  if (semesters.length === 0) {
    alert("Please select at least one semester")
    return
  }

  const courseData = {
    name,
    description,
    credit_hours: creditHours,
    department_id: departmentId,
    level,
    semesters,
    prerequisites
  }

  try {
    const response = await fetch(`${API_BASE_URL}/courses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || "Failed to create course")
    }

    alert("Course created successfully!")
    const modal = bootstrap.Modal.getInstance(document.getElementById("courseModal"))
    if (modal) {
      modal.hide()
    }
    document.getElementById("courseForm").reset()
    loadCourses()
  } catch (error) {
    console.error("Error creating course:", error)
    alert(error.message || "Error creating course. Please try again.")
  }
})

// Handle course update
document.getElementById("editForm").addEventListener("submit", async (event) => {
  event.preventDefault()

  // Get the course ID from the data attribute on the form element
  const courseId = document.getElementById("editForm").getAttribute("data-course-id")

  // Validate required fields
  const name = document.getElementById("edit_courseTitle").value.trim()
  const description = document.getElementById("edit_courseDescription").value.trim()
  const creditHours = Number.parseInt(document.getElementById("edit_creditHours").value)
  const departmentId = document.getElementById("edit_department").value
  const level = Number.parseInt(document.getElementById("edit_level").value)
  const semesters = getSelectedSemesters("edit_")
  const prerequisites = getSelectedPrerequisites("edit_prerequisitesSelect")

  // Validation
  if (!name || name.length < 3 || name.length > 100) {
    alert("Course name must be between 3 and 100 characters")
    return
  }

  if (!description || description.length < 10 || description.length > 500) {
    alert("Course description must be between 10 and 500 characters")
    return
  }

  if (!creditHours || creditHours < 1 || creditHours > 4) {
    alert("Credit hours must be between 1 and 4")
    return
  }

  if (!departmentId) {
    alert("Please select a department")
    return
  }

  if (!level || level < 1 || level > 4) {
    alert("Level must be between 1 and 4")
    return
  }

  if (semesters.length === 0) {
    alert("Please select at least one semester")
    return
  }

  const courseData = {
    name,
    description,
    credit_hours: creditHours,
    department_id: departmentId,
    level,
    semesters,
    prerequisites
  }

  try {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseData),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || "Failed to update course")
    }

    alert("Course updated successfully!")
    const modal = bootstrap.Modal.getInstance(document.getElementById("editModal"))
    if (modal) {
      modal.hide()
    }
    document.getElementById("editForm").reset()
    loadCourses()
  } catch (error) {
    console.error("Error updating course:", error)
    alert(error.message || "Error updating course. Please try again.")
  }
})

// Delete a course
async function deleteCourse(courseId) {
  try {
    const response = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      method: "DELETE"
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || "Failed to delete course")
    }
    alert("Course deleted successfully!")
    loadCourses()
  } catch (error) {
    console.error("Error deleting course:", error)
    alert(error.message || "Error deleting course. Please try again.")
  }
}

// Initial page load
window.addEventListener("DOMContentLoaded", () => {
  checkAuth()
  loadDepartments()
  loadCoursesForPrerequisites()
  loadCourses()
})