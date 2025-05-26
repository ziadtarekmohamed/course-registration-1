// Base API URL
const baseUrl = 'http://localhost:8000/api/v1';

// Get user data from token
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'Login.html';
  throw new Error('No access token found');
}

// Cache for course data
const courseCache = {
  timestamp: null,
  data: null,
  // Cache TTL in minutes (reduced from 5 to 1 minute)
  TTL: 1
};

// Registration status information
let registrationStatus = {
  registration_allowed: false,
  withdrawal_allowed: false,
  message: '',
  registration_message: '',
  withdrawal_message: ''
};

// Global variable to store currently selected time slots
let selectedTimeSlots = {
  lecture: null,
  lab: null,
  tutorial: null
};

// Global variable to store current course ID for time slot selection
let currentCourseId = null;

// Mock time slots data for testing
const MOCK_TIME_SLOTS = {
  lecture: [
    { time_slot_id: "L1", day_of_week: "Monday", start_time: "09:00 AM", end_time: "10:30 AM", instructor_name: "Dr. Smith", room_id: "A101" },
    { time_slot_id: "L2", day_of_week: "Wednesday", start_time: "09:00 AM", end_time: "10:30 AM", instructor_name: "Dr. Smith", room_id: "A101" },
    { time_slot_id: "L3", day_of_week: "Friday", start_time: "11:00 AM", end_time: "12:30 PM", instructor_name: "Dr. Johnson", room_id: "B202" }
  ],
  lab: [
    { time_slot_id: "LAB1", day_of_week: "Tuesday", start_time: "01:00 PM", end_time: "03:00 PM", instructor_name: "TA Williams", room_id: "LAB301" },
    { time_slot_id: "LAB2", day_of_week: "Thursday", start_time: "01:00 PM", end_time: "03:00 PM", instructor_name: "TA Davis", room_id: "LAB302" }
  ],
  tutorial: [
    { time_slot_id: "TUT1", day_of_week: "Tuesday", start_time: "04:00 PM", end_time: "05:00 PM", instructor_name: "TA Roberts", room_id: "C105" },
    { time_slot_id: "TUT2", day_of_week: "Thursday", start_time: "04:00 PM", end_time: "05:00 PM", instructor_name: "TA Roberts", room_id: "C105" }
  ]
};

// Parse the JWT token to get user info
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    console.error("Error parsing JWT token:", e)
    return {}
  }
}

// Get user data from token
const userData = parseJwt(token)
let studentId = localStorage.getItem('userId') || userData.user_id;

// Log user data to debug
console.log('User data from token:', {
  id: studentId,
  role: userData.role,
  name: userData.name
});

// Performance monitoring
const performanceMetrics = {
  startTime: null,
  endTime: null,
  apiCalls: {},
  
  startTimer: function(name) {
    this.apiCalls[name] = { startTime: performance.now() };
    if (!this.startTime) this.startTime = performance.now();
  },
  
  endTimer: function(name) {
    if (this.apiCalls[name]) {
      this.apiCalls[name].endTime = performance.now();
      this.apiCalls[name].duration = this.apiCalls[name].endTime - this.apiCalls[name].startTime;
      console.log(`📊 ${name} took ${this.apiCalls[name].duration.toFixed(2)}ms`);
    }
  },
  
  finishLoading: function() {
    this.endTime = performance.now();
    const totalTime = this.endTime - this.startTime;
    console.log(`🚀 Total loading time: ${totalTime.toFixed(2)}ms`);
  }
};

// Elements to update
const totalCoursesElement = document.querySelector(".info-card:nth-child(1) .number")
const creditHoursElement = document.querySelector(".info-card:nth-child(2) .number")
const gpaElement = document.querySelector(".info-card:nth-child(3) .number")
const courseGrid = document.querySelector(".course-grid")
const searchInput = document.querySelector(".search-bar input")
const filterTabs = document.querySelectorAll(".filter-tabs .tab")

// Store courses for filtering
let allCourses = []
let registeredCourses = []
let availableCourses = []
let currentFilter = "all"

// Fetch student information
async function fetchStudentInfo() {
  performanceMetrics.startTimer('fetchStudentInfo');
  try {
    console.log('Fetching student info with ID:', studentId);
    
    // The backend expects student_id, instructor_id, or admin_id
    // Let's try to fetch the user by ID which should work for both formats
    let response = await fetch(`${baseUrl}/users/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    })

    console.log('Student info response status:', response.status);
    
    // If the first attempt fails and the ID is numeric, try with "student_" prefix
    if (!response.ok && !isNaN(studentId) && response.status === 404) {
      console.log('First attempt failed. Trying with student_ prefix...');
      const prefixedId = `student_${studentId}`;
      
      response = await fetch(`${baseUrl}/users/${prefixedId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      console.log('Second attempt response status:', response.status);
      
      // If the second attempt succeeds, update the studentId for future requests
      if (response.ok) {
        studentId = prefixedId;
        console.log('Updated studentId to:', studentId);
      }
    }
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        clearAuthStorage()
        window.location.href = "Login.html"
        return
      }
      
      // Try to get error details from response
      const errorText = await response.text();
      console.error("Student info error response:", errorText);
      
      throw new Error("Failed to fetch student information")
    }

    const student = await response.json()
    console.log('Student data received:', student);

    // Update credit hours and GPA on the page with null checks
    if (creditHoursElement) {
      creditHoursElement.textContent = student.credit_hours || 0
    }
    if (gpaElement) {
      gpaElement.textContent = student.GPA || "N/A"
    }

    performanceMetrics.endTimer('fetchStudentInfo');
    return student
  } catch (error) {
    performanceMetrics.endTimer('fetchStudentInfo');
    console.error("Error fetching student information:", error)
    displayErrorMessage("Failed to load student information")
  }
}

// Fetch student enrollments
async function fetchEnrollments() {
  performanceMetrics.startTimer('fetchEnrollments');
  try {
    console.log('Fetching enrollments for student:', studentId);
    console.log('Using baseUrl:', baseUrl);
    console.log('Using token:', token ? 'Token exists' : 'No token');
    
    const response = await fetch(`${baseUrl}/enrollments/student/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    })

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      if (response.status === 401) {
        console.log('Authentication failed - redirecting to login');
        clearAuthStorage()
        window.location.href = "Login.html"
        return
      }
      const errorData = await response.json().catch(() => ({}));
      console.error('Error response:', errorData);
      throw new Error(errorData.detail || `Failed to fetch enrollments: ${response.status}`)
    }

    const enrollments = await response.json()
    console.log('Received enrollments:', enrollments);
    
    registeredCourses = enrollments.filter(
      (enrollment) => enrollment.status === "Pending" || enrollment.status === "Completed",
    )

    // Update total courses on the page with null check
    if (totalCoursesElement) {
      totalCoursesElement.textContent = registeredCourses.length
    }

    performanceMetrics.endTimer('fetchEnrollments');
    return enrollments
  } catch (error) {
    performanceMetrics.endTimer('fetchEnrollments');
    console.error("Error fetching enrollments:", error)
    console.error("Error stack:", error.stack)
    displayErrorMessage(error.message || "Failed to load enrollment information")
    return []
  }
}

// Fetch available courses
async function fetchAvailableCourses(forceRefresh = false) {
  performanceMetrics.startTimer('fetchAvailableCourses');
  try {
    console.log("Fetching available courses...")
    
    // Check if cached data is available and valid (unless force refresh)
    const now = Date.now();
    if (!forceRefresh && courseCache.data && courseCache.timestamp && 
        ((now - courseCache.timestamp) / 60000) < courseCache.TTL) {
      console.log("🔄 Using cached course data");
      availableCourses = courseCache.data;
      processCourses();
      performanceMetrics.endTimer('fetchAvailableCourses');
      return courseCache.data;
    }
    
    // Show loading indicator in the course grid while fetching
    if (courseGrid) {
      courseGrid.innerHTML = '<div class="loading-indicator">Loading courses...</div>';
    }
    
    try {
      const response = await fetch(`${baseUrl}/courses/tree/available`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });

      console.log("Available courses response status:", response.status);
      
      if (!response.ok) {
        if (response.status === 401) {
          console.log("Authentication failed - redirecting to login");
          clearAuthStorage();
          window.location.href = "Login.html";
          return [];
        }
        
        // Try to get error details from response
        const errorText = await response.text();
        console.error("Error response text:", errorText);
        
        let errorDetail;
        try {
          errorDetail = JSON.parse(errorText).detail;
        } catch (e) {
          errorDetail = `Failed to fetch available courses: ${response.status}`;
        }
        
        throw new Error(errorDetail || `Failed to fetch available courses: ${response.status}`);
      }

      const data = await response.json();
      console.log("Available courses data received:", data ? "Data received" : "No data");

      // Handle empty data case
      if (!data || (Array.isArray(data) && data.length === 0)) {
        console.warn("No course data received from API");
        
        // Use empty array as fallback
        availableCourses = [];
        processCourses();
        
        // Show message in course grid
        if (courseGrid) {
          courseGrid.innerHTML = '<div class="info-message">No courses are available for registration at this time.</div>';
        }
        
        performanceMetrics.endTimer('fetchAvailableCourses');
        return [];
      }

      // The API returns an array of departments, each with courses
      // We need to extract all courses from all departments
      let extractedCourses = processCoursesFromDepartments(data);

      console.log("Extracted courses count:", extractedCourses.length);

      // Store all extracted courses
      availableCourses = extractedCourses;
      
      // Cache the course data
      courseCache.data = extractedCourses;
      courseCache.timestamp = Date.now();
      console.log("💾 Course data cached");

      // Process and merge courses
      processCourses();

      performanceMetrics.endTimer('fetchAvailableCourses');
      return extractedCourses;
    } catch (fetchError) {
      console.error("Fetch error:", fetchError);
      throw fetchError;
    }
  } catch (error) {
    performanceMetrics.endTimer('fetchAvailableCourses');
    console.error("Error fetching available courses:", error);
    console.error("Error stack:", error.stack);
    
    // Clear loading indicator if error occurs
    if (courseGrid) {
      courseGrid.innerHTML = '<div class="error-message">Failed to load courses. Please try again.</div>';
      
      // Add a retry button
      const retryButton = document.createElement("button");
      retryButton.className = "retry-button";
      retryButton.textContent = "Retry";
      retryButton.addEventListener("click", () => {
        fetchAvailableCourses(true); // Force refresh on retry
      });
      courseGrid.appendChild(retryButton);
      
      // Add style for the retry button
      if (!document.getElementById('retry-button-style')) {
        const style = document.createElement('style');
        style.id = 'retry-button-style';
        style.textContent = `
          .retry-button {
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            margin-top: 15px;
            cursor: pointer;
            font-size: 14px;
          }
          .retry-button:hover {
            background-color: #0069d9;
          }
          .error-message {
            color: #dc3545;
            padding: 15px;
            text-align: center;
            font-size: 16px;
            margin-bottom: 15px;
          }
          .info-message {
            color: #0c5460;
            background-color: #d1ecf1;
            padding: 15px;
            text-align: center;
            border-radius: 4px;
            margin-bottom: 15px;
          }
        `;
        document.head.appendChild(style);
      }
    }
    
    // Only display a non-intrusive error message for this (don't use alert)
    console.error("Failed to load available courses:", error.message);
    return [];
  }
}

// Extract courses from departments data - moved out to a separate function for clarity
function processCoursesFromDepartments(data) {
  let extractedCourses = [];
  
  if (Array.isArray(data)) {
    // Process department structure
    data.forEach((department) => {
      if (department.courses && Array.isArray(department.courses)) {
        // Add department info to each course
        const departmentCourses = department.courses.map((course) => ({
          ...course,
          department_name: department.department_name,
        }))
        extractedCourses = extractedCourses.concat(departmentCourses)

        // Also extract courses from children
        departmentCourses.forEach((course) => {
          if (course.children && Array.isArray(course.children)) {
            const flattenedChildren = flattenCourseTree(course.children, department.department_name)
            extractedCourses = extractedCourses.concat(flattenedChildren)
          }
        })
      }
    })
  } else {
    console.warn("Available courses data is not an array:", data);
  }
  
  return extractedCourses;
}

// Process and merge courses from both sources
function processCourses() {
  // Create a map of registered courses by course_id for quick lookup
  const registeredCoursesMap = new Map()
  registeredCourses.forEach((course) => {
    registeredCoursesMap.set(course.course_id, course)
  })

  // Process all available courses and mark if they're registered
  allCourses = availableCourses.map((course) => {
    const isRegistered = registeredCoursesMap.has(course.course_id)
    const registeredCourse = registeredCoursesMap.get(course.course_id)

    return {
      ...course,
      isRegistered,
      status: isRegistered ? registeredCourse.status : null,
      course_name: course.name || (registeredCourse ? registeredCourse.course_name : null),
    }
  })

  // Add any registered courses that might not be in the available courses list
  registeredCourses.forEach((course) => {
    if (!allCourses.some((c) => c.course_id === course.course_id)) {
      allCourses.push({
        ...course,
        name: course.course_name,
        isRegistered: true,
      })
    }
  })

  console.log("Processed courses:", allCourses)
}

// Helper function to flatten the course tree
function flattenCourseTree(courses, departmentName) {
  let flattenedCourses = []

  courses.forEach((course) => {
    // Add the course with department info
    flattenedCourses.push({
      ...course,
      department_name: departmentName,
    })

    // Recursively add children
    if (course.children && Array.isArray(course.children)) {
      const children = flattenCourseTree(course.children, departmentName)
      flattenedCourses = flattenedCourses.concat(children)
    }
  })

  return flattenedCourses
}

// Fetch registration status from server
async function fetchRegistrationStatus() {
  performanceMetrics.startTimer('fetchRegistrationStatus');
  try {
    const response = await fetch(`${baseUrl}/semester/registration/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    if (response.ok) {
      const status = await response.json();
      console.log('Registration status:', status);
      
      // Update global registration status
      registrationStatus = {
        registration_allowed: status.registration_allowed || false,
        withdrawal_allowed: status.withdrawal_allowed || false,
        message: status.message || '',
        registration_message: !status.registration_allowed ? 
          (status.message || "Course registration is currently closed by the administrator.") : '',
        withdrawal_message: !status.withdrawal_allowed ? 
          (status.message || "Course withdrawal is currently closed by the administrator.") : ''
      };
      
      // Show registration status notification if needed
      updateRegistrationStatusNotification();
    }
    
    performanceMetrics.endTimer('fetchRegistrationStatus');
    return registrationStatus;
  } catch (error) {
    performanceMetrics.endTimer('fetchRegistrationStatus');
    console.error("Error fetching registration status:", error);
    return registrationStatus;
  }
}

// Update the UI to show registration status notification
function updateRegistrationStatusNotification() {
  // Remove any existing notifications
  const existingNotification = document.querySelector('.registration-status-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create notification if registration or withdrawal is disabled
  if (!registrationStatus.registration_allowed || !registrationStatus.withdrawal_allowed) {
    const notification = document.createElement('div');
    notification.className = 'registration-status-notification';
    
    let notificationContent = '<div class="notification-header">Notice</div><div class="notification-content">';
    
    if (!registrationStatus.registration_allowed) {
      notificationContent += `
        <div class="status-item">
          <span class="status-icon">🔒</span>
          <span class="status-text">Course Registration: <span class="status-disabled">Disabled</span></span>
          <p>${registrationStatus.registration_message}</p>
        </div>`;
    }
    
    if (!registrationStatus.withdrawal_allowed) {
      notificationContent += `
        <div class="status-item">
          <span class="status-icon">🔒</span>
          <span class="status-text">Course Withdrawal: <span class="status-disabled">Disabled</span></span>
          <p>${registrationStatus.withdrawal_message}</p>
        </div>`;
    }
    
    notificationContent += '</div>';
    notification.innerHTML = notificationContent;
    
    // Insert at the top of the course grid
    if (courseGrid) {
      courseGrid.insertAdjacentElement('beforebegin', notification);
      
      // Add CSS for the notification
      const style = document.createElement('style');
      style.textContent = `
        .registration-status-notification {
          background-color: #fff3cd;
          border: 1px solid #ffecb5;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .notification-header {
          font-weight: bold;
          margin-bottom: 10px;
          color: #856404;
        }
        .status-item {
          margin-bottom: 8px;
          display: flex;
          flex-direction: column;
        }
        .status-icon {
          margin-right: 8px;
        }
        .status-text {
          font-weight: 500;
        }
        .status-disabled {
          color: #dc3545;
        }
        .status-item p {
          margin-top: 3px;
          margin-bottom: 0;
          font-size: 0.9em;
          color: #666;
        }
        .status-message {
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          color: #721c24;
          padding: 8px 12px;
          margin: 10px 0;
          font-size: 0.9em;
        }
        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

// Create a course card element
function createCourseCard(course) {
  const isRegistered = course.isRegistered
  const isRegisteredTab = currentFilter === "registered"

  const courseCard = document.createElement("div")
  courseCard.className = "course-card"
  courseCard.dataset.courseId = course.course_id

  // Check if course has prerequisites
  const hasPrerequisites = course.prerequisites && course.prerequisites.length > 0
  const prerequisitesText = hasPrerequisites
    ? `<div class="prerequisites">Prerequisites: ${course.prerequisites.join(", ")}</div>`
    : ""

  // Check if course is offered in current semester
  const semesterText =
    course.semesters && course.semesters.length > 0
      ? `<div class="semesters">Offered in: ${course.semesters.join(", ")}</div>`
      : '<div class="semesters">Offered in: All Semesters</div>'

  // Determine button text and class based on registration status and current tab
  let buttonClass = isRegistered ? "drop-btn" : "register-btn"
  let buttonText = isRegistered ? "Drop Course" : "Register"
  let buttonDisabled = ''
  let statusMsg = ''

  // Check if registration or withdrawal is disabled
  if (!isRegistered && !registrationStatus.registration_allowed) {
    buttonDisabled = 'disabled'
    statusMsg = `<div class="status-message">Registration Disabled: ${registrationStatus.registration_message}</div>`
  } else if (isRegistered && !registrationStatus.withdrawal_allowed && !isRegisteredTab) {
    buttonDisabled = 'disabled'
    statusMsg = `<div class="status-message">Withdrawal Disabled: ${registrationStatus.withdrawal_message}</div>`
  }

  // If we're in the registered tab, show "Choose Time Slot" instead
  if (isRegistered && isRegisteredTab) {
    buttonClass = "time-slot-btn"
    buttonText = "Choose Time Slot"
    buttonDisabled = '' // Enable time slot selection regardless of withdrawal status
    statusMsg = '' // No status message for time slot selection
  }

  courseCard.innerHTML = `
        <h2>${course.course_name || course.name}</h2>
        <p class="instructor">${course.instructor_name || "Instructor information unavailable"}</p>
        <div class="course-details">
            <div class="detail">
                <span>Course Code:</span>
                <span>${course.course_id}</span>
            </div>
            <div class="detail">
                <span>Credit Hours:</span>
                <span>${course.credit_hours}</span>
            </div>
            <div class="detail">
                <span>${isRegistered ? "Status:" : "Department:"}</span>
                <span>${isRegistered ? course.status : course.department_name || "Unknown"}</span>
            </div>
        </div>
        ${prerequisitesText}
        ${semesterText}
        ${statusMsg}
        <button class="${buttonClass}" ${buttonDisabled}>${buttonText}</button>
    `

  // Add event listeners to the buttons
  const button = courseCard.querySelector("button")

  if (!button.disabled) {
    if (isRegistered && isRegisteredTab) {
      // Time slot button for registered courses in the registered tab
      button.addEventListener("click", () => openTimeSlotModal(course.course_id))
    } else if (isRegistered) {
      // Drop button for registered courses in other tabs
      button.addEventListener("click", () => handleDropCourse(course.course_id))
    } else {
      // Register button for available courses
      button.addEventListener("click", () => handleRegisterCourse(course.course_id))
    }
  }

  return courseCard
}

// Function to clear course cache and reload courses
function clearCourseCache() {
  courseCache.data = null;
  courseCache.timestamp = null;
  console.log("Course cache cleared");
  
  // Show loading indicator
  if (courseGrid) {
    courseGrid.innerHTML = '<div class="loading-indicator">Refreshing courses...</div>';
  }
  
  // Reload courses data with force refresh
  fetchAvailableCourses(true).then(() => {
    displayCourses(currentFilter);
  });
}

// Display courses based on filter
function displayCourses(filter = "all", searchTerm = "") {
  courseGrid.innerHTML = ""
  
  // Add refresh button above the course grid
  const refreshButton = document.createElement("button");
  refreshButton.className = "refresh-courses-btn";
  refreshButton.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh Courses';
  refreshButton.addEventListener("click", clearCourseCache);
  courseGrid.appendChild(refreshButton);
  
  // Add a style for the refresh button if not already present
  if (!document.getElementById('refresh-button-style')) {
    const style = document.createElement('style');
    style.id = 'refresh-button-style';
    style.textContent = `
      .refresh-courses-btn {
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        font-size: 14px;
        color: #495057;
        transition: all 0.2s;
      }
      .refresh-courses-btn:hover {
        background-color: #e9ecef;
      }
      .refresh-courses-btn i {
        margin-right: 5px;
      }
    `;
    document.head.appendChild(style);
  }
  
  let coursesToDisplay = []

  switch (filter) {
    case "registered":
      coursesToDisplay = allCourses.filter((course) => course.isRegistered)
      break
    case "available":
      coursesToDisplay = allCourses.filter((course) => !course.isRegistered)
      break
    default: // 'all'
      coursesToDisplay = allCourses
  }

  // Apply search filter if search is active
  if (searchTerm) {
    coursesToDisplay = coursesToDisplay.filter(
      (course) =>
        (course.course_name || course.name).toLowerCase().includes(searchTerm) ||
        course.course_id.toLowerCase().includes(searchTerm),
    )
  }

  if (coursesToDisplay.length === 0) {
    const emptyMessage = document.createElement("div")
    emptyMessage.className = "empty-message"
    emptyMessage.textContent = "No courses found"
    courseGrid.appendChild(emptyMessage)
  } else {
    coursesToDisplay.forEach((course) => {
      courseGrid.appendChild(createCourseCard(course))
    })
  }
}

// Handle course registration
async function handleRegisterCourse(courseId) {
  try {
    // First check if registration is allowed
    try {
      const statusResponse = await fetch(`${baseUrl}/semester/registration/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        // Update the global registration status
        const previousRegistrationAllowed = registrationStatus.registration_allowed;
        
        registrationStatus.registration_allowed = status.registration_allowed || false;
        registrationStatus.registration_message = !status.registration_allowed ? 
          (status.message || "Course registration is currently closed.") : '';
          
        // If registration status changed, update the UI
        if (previousRegistrationAllowed !== registrationStatus.registration_allowed) {
          updateRegistrationStatusNotification();
          // Re-display courses to update UI
          displayCourses(currentFilter);
        }
          
        if (!status.registration_allowed) {
          if (window.Swal) {
            Swal.fire({
              title: 'Registration Closed',
              text: status.message || "Course registration is currently closed.",
              icon: 'warning',
              confirmButtonText: 'OK'
            });
          } else {
            alert(status.message || "Course registration is currently closed.");
          }
          return;
        }
      }
    } catch (statusError) {
      console.error("Error checking registration status:", statusError);
    }
    
    // Show loading indicator
    let loadingAlert;
    if (window.Swal) {
      loadingAlert = Swal.fire({
        title: 'Registering...',
        text: 'Processing your course registration',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }
    
    const response = await fetch(`${baseUrl}/enrollments/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        student_id: studentId,
        course_id: courseId,
      }),
    })
    
    // Close loading indicator if using SweetAlert2
    if (loadingAlert) {
      loadingAlert.close();
    }

    if (!response.ok) {
      const errorData = await response.json()
      const errorMessage = errorData.detail || "Failed to register for course";
      
      if (window.Swal) {
        Swal.fire({
          title: 'Registration Failed',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      } else {
        alert(`Registration failed: ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json()

    // Show success message
    if (window.Swal) {
      Swal.fire({
        title: 'Success!',
        text: `Successfully registered for ${result.course_name}`,
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } else {
      alert(`Successfully registered for ${result.course_name}`);
    }

    // Update the course in our local data instead of refreshing everything
    updateCourseRegistrationStatus(courseId, true, result)

    // Refresh the display with the current filter
    displayCourses(currentFilter)
  } catch (error) {
    console.error("Error registering for course:", error);
    if (!window.Swal) {
      alert(`Registration failed: ${error.message}`);
    }
  }
}

// Handle dropping a course
async function handleDropCourse(courseId) {
  try {
    // First check if withdrawal is allowed
    try {
      const statusResponse = await fetch(`${baseUrl}/semester/registration/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        // Update the global registration status
        const previousWithdrawalAllowed = registrationStatus.withdrawal_allowed;
        
        registrationStatus.withdrawal_allowed = status.withdrawal_allowed || false;
        registrationStatus.withdrawal_message = !status.withdrawal_allowed ? 
          (status.message || "Course withdrawal is currently closed.") : '';
        
        // If withdrawal status changed, update the UI
        if (previousWithdrawalAllowed !== registrationStatus.withdrawal_allowed) {
          updateRegistrationStatusNotification();
          // Re-display courses to update UI
          displayCourses(currentFilter);
        }
          
        if (!status.withdrawal_allowed) {
          if (window.Swal) {
            Swal.fire({
              title: 'Withdrawal Closed',
              text: status.message || "Course withdrawal is currently closed.",
              icon: 'warning',
              confirmButtonText: 'OK'
            });
          } else {
            alert(status.message || "Course withdrawal is currently closed.");
          }
          return;
        }
      }
    } catch (statusError) {
      console.error("Error checking withdrawal status:", statusError);
    }
    
    // Ask for confirmation
    let shouldProceed = false;
    
    if (window.Swal) {
      const result = await Swal.fire({
        title: 'Confirm Course Drop',
        text: 'Are you sure you want to drop this course?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, drop it',
        cancelButtonText: 'Cancel'
      });
      
      shouldProceed = result.isConfirmed;
    } else {
      shouldProceed = confirm("Are you sure you want to drop this course?");
    }
    
    if (!shouldProceed) {
      return;
    }
    
    // Show loading indicator
    let loadingAlert;
    if (window.Swal) {
      loadingAlert = Swal.fire({
        title: 'Processing...',
        text: 'Dropping course',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }

    const response = await fetch(`${baseUrl}/enrollments/${courseId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    // Close loading indicator if using SweetAlert2
    if (loadingAlert) {
      loadingAlert.close();
    }

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || "Failed to drop course";
      
      if (window.Swal) {
        Swal.fire({
          title: 'Error',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      } else {
        alert(`Failed to drop course: ${errorMessage}`);
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Show success message
    if (window.Swal) {
      Swal.fire({
        title: 'Success!',
        text: result.message || 'Course dropped successfully',
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } else {
      alert(result.message);
    }

    // Update the course in our local data instead of refreshing everything
    updateCourseRegistrationStatus(courseId, false);

    // Refresh the display with the current filter
    displayCourses(currentFilter)
  } catch (error) {
    console.error("Error dropping course:", error);
    if (!window.Swal) {
      alert(`Failed to drop course: ${error.message}`);
    }
  }
}

// Update course registration status in local data
function updateCourseRegistrationStatus(courseId, isRegistered, courseData = null) {
  // Find the course in our allCourses array
  const courseIndex = allCourses.findIndex((course) => course.course_id === courseId)

  if (courseIndex !== -1) {
    // Update the course registration status
    allCourses[courseIndex].isRegistered = isRegistered

    if (isRegistered && courseData) {
      // Update with data from the registration response
      allCourses[courseIndex].status = courseData.status
      allCourses[courseIndex].course_name = courseData.course_name

      // Add to registered courses
      registeredCourses.push({
        ...courseData,
        isRegistered: true,
      })

      // Update total courses count
      totalCoursesElement.textContent = registeredCourses.length
    } else if (!isRegistered) {
      // Remove from registered courses
      registeredCourses = registeredCourses.filter((course) => course.course_id !== courseId)

      // Update total courses count
      totalCoursesElement.textContent = registeredCourses.length
    }
  }
}

// Display error message
function displayErrorMessage(message) {
  console.error("Error:", message);
  
  // Use SweetAlert2 if available
  if (window.Swal) {
    Swal.fire({
      title: 'Error',
      text: message,
      icon: 'error',
      confirmButtonText: 'OK'
    });
  } else {
    // Create a visible error message on the page
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-notification';
    errorContainer.innerHTML = `
      <div class="error-content">
        <i class="bi bi-exclamation-triangle-fill"></i>
        <span>${message}</span>
        <button class="close-error">&times;</button>
      </div>
    `;
    
    // Add styles if they don't exist
    if (!document.getElementById('error-notification-style')) {
      const style = document.createElement('style');
      style.id = 'error-notification-style';
      style.textContent = `
        .error-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          padding: 15px;
          z-index: 1000;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          max-width: 350px;
          animation: slideIn 0.3s ease-out;
        }
        
        .error-content {
          display: flex;
          align-items: center;
        }
        
        .error-content i {
          color: #dc3545;
          font-size: 20px;
          margin-right: 10px;
        }
        
        .error-content span {
          flex-grow: 1;
          color: #721c24;
        }
        
        .close-error {
          background: none;
          border: none;
          color: #721c24;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          margin-left: 10px;
        }
        
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Add to document
    document.body.appendChild(errorContainer);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorContainer && errorContainer.parentNode) {
        errorContainer.parentNode.removeChild(errorContainer);
      }
    }, 5000);
    
    // Add close button functionality
    const closeButton = errorContainer.querySelector('.close-error');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        if (errorContainer && errorContainer.parentNode) {
          errorContainer.parentNode.removeChild(errorContainer);
        }
      });
    }
  }
}

// Event listeners for tab buttons
filterTabs.forEach((tab) => {
  tab.addEventListener("click", function () {
    filterTabs.forEach((t) => t.classList.remove("active"))
    this.classList.add("active")

    const filter = this.textContent.toLowerCase()
    currentFilter = filter
    displayCourses(filter)
  })
})

// Event listener for search input
searchInput.addEventListener("input", () => {
  displayCourses(currentFilter)
})

// Time slot modal handling
async function openTimeSlotModal(courseId) {
  try {
    currentCourseId = courseId;
    const modal = document.getElementById("timeSlotModal");
    document.getElementById("courseCodeDisplay").textContent = courseId;
    
    // Reset selected time slots
    selectedTimeSlots = {
      lecture: null,
      lab: null,
      tutorial: null
    };
    
    // Show loading state
    document.getElementById("courseSummary").innerHTML = '<div class="loading-indicator">Loading course info...</div>';
    document.getElementById("lecture").innerHTML = '<div class="loading-indicator">Loading lecture time slots...</div>';
    document.getElementById("lab").innerHTML = '<div class="loading-indicator">Loading lab time slots...</div>';
    document.getElementById("tutorial").innerHTML = '<div class="loading-indicator">Loading tutorial time slots...</div>';
    document.getElementById("selectedSummary").innerHTML = '<p class="no-selection-message">No time slots selected yet</p>';
    
    // Initialize tab badges
    document.getElementById("lectureBadge").textContent = "0";
    document.getElementById("labBadge").textContent = "0";
    document.getElementById("tutorialBadge").textContent = "0";
    
    // Get course details to display summary
    const course = allCourses.find(c => c.course_id === courseId);
    if (course) {
      const courseSummaryHTML = `
        <div class="info-item">
          <span class="label">Course Code</span>
          <span class="value">${course.course_id}</span>
        </div>
        <div class="info-item">
          <span class="label">Course Name</span>
          <span class="value">${course.name}</span>
        </div>
        <div class="info-item">
          <span class="label">Credit Hours</span>
          <span class="value">${course.credit_hours || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="label">Department</span>
          <span class="value">${course.department_name || 'N/A'}</span>
        </div>
      `;
      document.getElementById("courseSummary").innerHTML = courseSummaryHTML;
    }
    
    // Fetch available time slots
    await fetchAvailableTimeSlots(courseId);
    
    // Setup tab navigation
    setupTabNavigation();
    
    // Add event listener to the Save button
    document.getElementById("saveSlotBtn").addEventListener("click", saveTimeSlotSelection);
    
    // Show the modal
    modal.style.display = "block";
  } catch (error) {
    console.error("Error opening time slot modal:", error);
    if (typeof showError === 'function') {
      showError("Failed to load time slots. Please try again.");
    } else {
      alert("Failed to load time slots. Please try again.");
    }
  }
}

// Fetch available time slots for a course, now with seat availability
async function fetchAvailableTimeSlots(courseId) {
  try {
    // Show loading indicators in all tabs
    document.getElementById("lecture").innerHTML = '<div class="loading-indicator"><i class="bi bi-hourglass-split"></i> Loading lecture slots...</div>';
    document.getElementById("lab").innerHTML = '<div class="loading-indicator"><i class="bi bi-hourglass-split"></i> Loading lab slots...</div>';
    document.getElementById("tutorial").innerHTML = '<div class="loading-indicator"><i class="bi bi-hourglass-split"></i> Loading tutorial slots...</div>';

    // Get the token for authorization
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token found');
      throw new Error('You must be logged in to view time slots');
    }
    
    // Use the new endpoint that includes seat availability
    const response = await fetch(`${baseUrl}/schedule/time-slots-with-seats/${courseId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    
    console.log(`Time slots API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch time slots: ${response.status}`);
      console.error(`Error response: ${errorText}`);
      
      document.getElementById("lecture").innerHTML = '<div class="error-message">No lecture slots available</div>';
      document.getElementById("lab").innerHTML = '<div class="error-message">No lab slots available</div>';
      document.getElementById("tutorial").innerHTML = '<div class="error-message">No tutorial slots available</div>';
      
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    const timeSlotData = await response.json();
    console.log("Time slots data from API:", timeSlotData);
    
    // Use the grouped data directly since our new endpoint returns already grouped data
    const groupedSlots = {
      lecture: timeSlotData.lecture || [],
      lab: timeSlotData.lab || [],
      tutorial: timeSlotData.tutorial || []
    };
    
    console.log("Grouped time slots:", {
      lecture: groupedSlots.lecture.length,
      lab: groupedSlots.lab.length,
      tutorial: groupedSlots.tutorial.length
    });
    
    // Update badge counts
    document.getElementById("lectureBadge").textContent = groupedSlots.lecture.length;
    document.getElementById("labBadge").textContent = groupedSlots.lab.length;
    document.getElementById("tutorialBadge").textContent = groupedSlots.tutorial.length;
    
    // Display time slots in their respective tabs with seat availability
    displayTimeSlots("lecture", groupedSlots.lecture);
    displayTimeSlots("lab", groupedSlots.lab);
    displayTimeSlots("tutorial", groupedSlots.tutorial);
    
    // Check if student already has selected time slots for this course
    await fetchExistingTimeSlots(courseId);
    
  } catch (error) {
    console.error("Error fetching time slots:", error);
    document.getElementById("lecture").innerHTML = '<div class="error-message">Failed to load time slots</div>';
    document.getElementById("lab").innerHTML = '<div class="error-message">Failed to load time slots</div>';
    document.getElementById("tutorial").innerHTML = '<div class="error-message">Failed to load time slots</div>';
  }
}

// Display time slots in the specified tab with seat availability information
function displayTimeSlots(tabId, timeSlots) {
  const tabElement = document.getElementById(tabId);
  
  console.log(`Displaying ${timeSlots.length} ${tabId} slots in tab`);
  
  if (!timeSlots || timeSlots.length === 0) {
    tabElement.innerHTML = '<div class="no-slots-message">No time slots available</div>';
    return;
  }
  
  let html = '<div class="time-slots-grid">';
  
  timeSlots.forEach(slot => {
    const selectedClass = selectedTimeSlots[tabId] === slot.slot_id ? 'selected' : '';
    
    // Determine status based on available seats
    let statusClass = '';
    let statusText = '';
    
    if (slot.seats_available <= 0) {
      statusClass = 'full';
      statusText = 'FULL';
    } else if (slot.seats_available < 5) {
      statusClass = 'limited';
      statusText = `${slot.seats_available} seats left`;
    } else {
      statusClass = 'available';
      statusText = `${slot.seats_available} seats available`;
    }
    
    const day = slot.day_of_week || slot.day;
    const startTime = formatTime(slot.start_time);
    const endTime = formatTime(slot.end_time);
    const instructorName = slot.instructor_name || 'TBD';
    const roomName = slot.room_name || slot.room_id || 'TBD';
    
    // Disable selection for full slots
    const disabledAttr = statusClass === 'full' ? 'disabled="disabled"' : '';
    const disabledClass = statusClass === 'full' ? 'disabled' : '';
    
    html += `
      <div class="time-slot-card ${tabId} ${selectedClass} ${disabledClass}" 
           data-slot-id="${slot.slot_id}" ${disabledAttr}>
        <div class="time-slot-day">${day}</div>
        <div class="time-slot-time">${startTime} - ${endTime}</div>
        <div class="time-slot-instructor">${instructorName}</div>
        <div class="time-slot-room">${roomName}</div>
        <div class="time-slot-seats ${statusClass}">
          <i class="bi bi-person-fill"></i> ${statusText}
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  tabElement.innerHTML = html;
  
  // Add click event listeners to time slot cards
  tabElement.querySelectorAll('.time-slot-card:not(.disabled)').forEach(card => {
    card.addEventListener('click', () => {
      selectTimeSlot(tabId, card.dataset.slotId);
    });
  });
}

// Add CSS styles for seat availability
function addSeatAvailabilityStyles() {
  if (!document.getElementById('seat-availability-styles')) {
    const style = document.createElement('style');
    style.id = 'seat-availability-styles';
    style.textContent = `
      .time-slot-seats {
        margin-top: 8px;
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .time-slot-seats i {
        margin-right: 4px;
      }
      
      .time-slot-seats.available {
        background-color: #e3fcef;
        color: #0d6832;
      }
      
      .time-slot-seats.limited {
        background-color: #fff3cd;
        color: #856404;
      }
      
      .time-slot-seats.full {
        background-color: #f8d7da;
        color: #721c24;
      }
      
      .time-slot-card.disabled {
        opacity: 0.7;
        cursor: not-allowed;
        position: relative;
      }
      
      .time-slot-card.disabled::after {
        content: 'FULL';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-30deg);
        background-color: rgba(220, 53, 69, 0.9);
        color: white;
        font-weight: bold;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 2;
      }
    `;
    document.head.appendChild(style);
  }
}

// Add styles for toast notifications if they don't exist
function addToastStyles() {
  if (!document.getElementById('toast-notification-style')) {
    const style = document.createElement('style');
    style.id = 'toast-notification-style';
    style.textContent = `
      .toast-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #d1e7dd;
        border: 1px solid #badbcc;
        border-radius: 4px;
        padding: 12px 15px;
        z-index: 1100;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        max-width: 300px;
        animation: slideInToast 0.3s ease-out, fadeOutToast 0.5s ease-in 2.5s forwards;
      }
      
      .toast-content {
        display: flex;
        align-items: center;
      }
      
      .toast-content i {
        color: #0f5132;
        font-size: 18px;
        margin-right: 10px;
      }
      
      .toast-content span {
        color: #0f5132;
        font-size: 14px;
      }
      
      @keyframes slideInToast {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes fadeOutToast {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Modified initialization function
async function init() {
  try {
    console.log("Initializing student registration page");
    
    // Add seat availability styles
    addSeatAvailabilityStyles();
    
    // Add toast notification styles
    addToastStyles();
    
    // Setup tab navigation
    setupTabNavigation();
    
    // Get student info
    await fetchStudentInfo();
    
    // Get registration status
    await fetchRegistrationStatus();
    
    // Fetch enrollments
    await fetchEnrollments();
    
    // Show available courses
    await fetchAvailableCourses();
    
    // Display initial course list
    displayCourses();
    
    // Add event listeners for search box
    const searchInput = document.querySelector(".search-bar input");
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        // Filter courses based on search term
        displayCourses(currentFilter, searchTerm);
      });
    }
    
    // Add event listeners for filter tabs
    const filterTabs = document.querySelectorAll(".filter-tabs .tab");
    if (filterTabs && filterTabs.length > 0) {
      filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
          // Remove active class from all tabs
          filterTabs.forEach(t => t.classList.remove('active'));
          // Add active class to clicked tab
          this.classList.add('active');
          
          // Determine filter based on tab text
          let filter = "all";
          if (this.textContent.includes("Registered")) {
            filter = "registered";
          } else if (this.textContent.includes("Available")) {
            filter = "available";
          }
          
          currentFilter = filter;
          // Apply filter using the current search term if any
          const currentSearchTerm = searchInput ? searchInput.value.toLowerCase() : '';
          displayCourses(filter, currentSearchTerm);
        });
      });
    }
    
    // Add event listener for save time slot selection
    const saveSlotBtn = document.getElementById('saveSlotBtn');
    if (saveSlotBtn) {
      saveSlotBtn.addEventListener('click', saveTimeSlotSelection);
    }
    
    console.log("Student registration page initialized");
    
    // Finish performance monitoring
    performanceMetrics.finishLoading();
  } catch (error) {
    console.error("Error initializing student registration page:", error);
    displayErrorMessage("An error occurred while loading the registration page. Please try again later.");
  }
}

// Start initialization when document is ready
document.addEventListener("DOMContentLoaded", function() {
  // Initialize the application
  init().catch(error => {
    console.error("Failed to initialize page:", error);
    
    // Show a user-friendly error with retry button
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.innerHTML = `
        <div class="initialization-error">
          <h2><i class="bi bi-exclamation-triangle"></i> Something went wrong</h2>
          <p>We couldn't load the course registration page. This might be due to a network issue or server problem.</p>
          <button id="retryInitButton" class="btn-retry">Try Again</button>
        </div>
      `;
      
      // Add style for the error message
      if (!document.getElementById('init-error-style')) {
        const style = document.createElement('style');
        style.id = 'init-error-style';
        style.textContent = `
          .initialization-error {
            text-align: center;
            padding: 40px 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
            margin: 20px;
          }
          .initialization-error h2 {
            color: #dc3545;
            margin-bottom: 20px;
          }
          .initialization-error i {
            margin-right: 10px;
          }
          .initialization-error p {
            color: #6c757d;
            margin-bottom: 30px;
            font-size: 16px;
          }
          .btn-retry {
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 10px 20px;
            font-size: 16px;
            cursor: pointer;
          }
          .btn-retry:hover {
            background-color: #0069d9;
          }
        `;
        document.head.appendChild(style);
      }
      
      // Add event listener for retry button
      const retryButton = document.getElementById('retryInitButton');
      if (retryButton) {
        retryButton.addEventListener('click', function() {
          window.location.reload();
        });
      }
    }
  });
});

// Handle window click for modal
window.onclick = (event) => {
  const modal = document.getElementById("timeSlotModal")
  if (event.target == modal) {
    modal.style.display = "none"
  }
}

// Function to clear authentication storage
function clearAuthStorage() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userId");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userName");
}

function logout() {
  localStorage.clear();
  window.location.href = "Login.html";
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', function(e) {
    e.preventDefault();
    logout();
  });
}

// Save time slot selection
async function saveTimeSlotSelection() {
  try {
    // Check if at least one time slot is selected
    const hasSelection = selectedTimeSlots.lecture || selectedTimeSlots.lab || selectedTimeSlots.tutorial;
    
    if (!hasSelection) {
      if (window.Swal) {
        Swal.fire({
          title: 'Selection Required',
          text: 'Please select at least one time slot',
          icon: 'warning',
          confirmButtonText: 'OK'
        });
      } else {
        alert("Please select at least one time slot");
      }
      return;
    }
    
    // Check for conflicts before saving
    const conflicts = document.querySelectorAll('.time-slot-card.conflict');
    if (conflicts.length > 0) {
      if (window.Swal) {
        const result = await Swal.fire({
          title: 'Time Conflict Detected',
          text: 'There are conflicts between your selected time slots. Do you want to proceed anyway?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, Proceed',
          cancelButtonText: 'No, Fix Conflicts'
        });
        
        if (!result.isConfirmed) {
          return;
        }
      } else {
        const proceed = confirm("Time conflicts detected. Do you want to proceed anyway?");
        if (!proceed) return;
      }
    }
    
    // Show loading indicator
    let loadingAlert;
    if (window.Swal) {
      loadingAlert = Swal.fire({
        title: 'Saving...',
        text: 'Saving your time slot selection',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    }
    
    // Check if any of the selected slots are already registered by the student
    try {
      const scheduleResponse = await fetch(`${baseUrl}/schedule/${studentId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });
      
      if (scheduleResponse.ok) {
        const scheduleData = await scheduleResponse.json();
        const courseSchedule = scheduleData.schedule?.find(item => item.course_id === currentCourseId);
        
        if (courseSchedule && courseSchedule.slots && courseSchedule.slots.length > 0) {
          // Check if any selected slot is already registered
          let alreadyRegistered = false;
          let alreadyRegisteredType = '';
          
          for (const [type, slotId] of Object.entries(selectedTimeSlots)) {
            if (!slotId) continue;
            
            const existingSlot = courseSchedule.slots.find(slot => 
              slot.slot_id === slotId && slot.type.toLowerCase() === type.toLowerCase()
            );
            
            if (existingSlot) {
              alreadyRegistered = true;
              alreadyRegisteredType = type;
              break;
            }
          }
          
          if (alreadyRegistered) {
            // Close loading indicator
            if (loadingAlert) {
              loadingAlert.close();
            }
            
            if (window.Swal) {
              Swal.fire({
                title: 'Already Registered',
                text: `You have already registered for this ${alreadyRegisteredType} time slot.`,
                icon: 'info',
                confirmButtonText: 'OK'
              });
            } else {
              alert(`You have already registered for this ${alreadyRegisteredType} time slot.`);
            }
            return;
          }
        }
      }
    } catch (scheduleError) {
      console.error("Error checking existing schedule:", scheduleError);
      // Continue with the registration attempt even if this check fails
    }
    
    // Store the selected slot IDs before sending requests
    const selectedSlots = {
      lecture: selectedTimeSlots.lecture,
      lab: selectedTimeSlots.lab,
      tutorial: selectedTimeSlots.tutorial
    };
    
    // Process and save each time slot individually
    const savePromises = [];
    const responseData = [];
    
    // Save each selected time slot using the correct endpoint
    if (selectedTimeSlots.lecture) {
      savePromises.push(
        fetch(`${baseUrl}/schedule/select-time-slot`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            course_id: currentCourseId,
            slot_id: selectedTimeSlots.lecture
          }),
        }).then(response => {
          if (response.ok) {
            return response.json().then(data => {
              responseData.push({ type: 'lecture', data });
              return { ok: true };
            });
          }
          return response;
        })
      );
    }
    
    if (selectedTimeSlots.lab) {
      savePromises.push(
        fetch(`${baseUrl}/schedule/select-time-slot`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            course_id: currentCourseId,
            slot_id: selectedTimeSlots.lab
          }),
        }).then(response => {
          if (response.ok) {
            return response.json().then(data => {
              responseData.push({ type: 'lab', data });
              return { ok: true };
            });
          }
          return response;
        })
      );
    }
    
    if (selectedTimeSlots.tutorial) {
      savePromises.push(
        fetch(`${baseUrl}/schedule/select-time-slot`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            course_id: currentCourseId,
            slot_id: selectedTimeSlots.tutorial
          }),
        }).then(response => {
          if (response.ok) {
            return response.json().then(data => {
              responseData.push({ type: 'tutorial', data });
              return { ok: true };
            });
          }
          return response;
        })
      );
    }
    
    // Wait for all time slot selections to complete
    const responses = await Promise.all(savePromises);
    
    // Close loading indicator if using SweetAlert2
    if (loadingAlert) {
      loadingAlert.close();
    }
    
    // Check for errors in responses
    let hasError = false;
    let errorMessage = "";
    
    for (const response of responses) {
      if (!response.ok) {
        hasError = true;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || `Failed to save time slot selection: ${response.status}`;
        } catch (e) {
          errorMessage = `Error (${response.status}): ${await response.text() || 'Unknown error'}`;
        }
        console.error("Time slot selection error:", errorMessage);
        break;
      }
    }
    
    if (hasError) {
      if (window.Swal) {
        Swal.fire({
          title: 'Error',
          text: errorMessage,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      } else {
        alert(`Error: ${errorMessage}`);
      }
      throw new Error(errorMessage);
    }
    
    // Update the available seats in the UI for selected time slots
    updateSeatsAfterSelection(selectedSlots);
    
    // Show success message
    if (window.Swal) {
      Swal.fire({
        title: 'Success!',
        text: 'Time slot selection saved successfully',
        icon: 'success',
        confirmButtonText: 'OK'
      }).then(() => {
        // Close modal after success
        closeModal();
        // Refresh the page to reflect changes
        location.reload();
      });
    } else {
      alert("Time slot selection saved successfully!");
      closeModal();
      // Refresh the page to reflect changes
      location.reload();
    }
    
  } catch (error) {
    console.error("Error saving time slot selection:", error);
    if (window.Swal) {
      Swal.fire({
        title: 'Error',
        text: `Failed to save time slot selection: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK'
      });
    } else {
      alert(`Failed to save time slot selection: ${error.message}`);
    }
  }
}

// Function to update available seats after selection - improved to accurately count seats
function updateSeatsAfterSelection(selectedSlots) {
  // For each selected slot, update the seats available
  Object.entries(selectedSlots).forEach(([type, slotId]) => {
    if (!slotId) return;
    
    // Find the slot card
    const slotCard = document.querySelector(`.time-slot-card[data-slot-id="${slotId}"]`);
    if (!slotCard) return;
    
    // Find the seats element
    const seatsElement = slotCard.querySelector('.time-slot-seats');
    if (!seatsElement) return;
    
    // Get current seats info
    const currentText = seatsElement.textContent.trim();
    let seatsAvailable = 0;
    
    // Extract the number of available seats
    const match = currentText.match(/(\d+)\s+seats?/);
    if (match && match[1]) {
      seatsAvailable = parseInt(match[1], 10);
    }
    
    // Check if this is already registered by the student
    // If it's already registered, we shouldn't decrease the count again
    let isAlreadyRegistered = false;
    
    // We'll check this by looking at the 'selected' class that was applied during fetchExistingTimeSlots
    const wasPreSelected = slotCard.classList.contains('selected') && 
                          document.getElementById('selectedSummary').textContent.includes(slotId);
    
    // Only decrease seat count if this wasn't already selected
    if (!wasPreSelected && seatsAvailable > 0) {
      seatsAvailable--;
      
      // Update the text
      let newText = '';
      let statusClass = '';
      
      if (seatsAvailable <= 0) {
        newText = 'FULL';
        statusClass = 'full';
        // Add disabled class to the card
        slotCard.classList.add('disabled');
      } else if (seatsAvailable < 5) {
        newText = `${seatsAvailable} seat${seatsAvailable === 1 ? '' : 's'} left`;
        statusClass = 'limited';
      } else {
        newText = `${seatsAvailable} seats available`;
        statusClass = 'available';
      }
      
      // Update the element
      seatsElement.textContent = newText;
      seatsElement.className = `time-slot-seats ${statusClass}`;
      
      console.log(`Updated seats for ${type} slot ${slotId}: ${newText}`);
    } else if (wasPreSelected) {
      console.log(`Slot ${slotId} was already selected, not updating seat count`);
    }
  });
}

// Handle time slot selection
function selectTimeSlot(tabId, slotId) {
  console.log(`Selecting ${tabId} slot: ${slotId}`);
  
  // Check if this slot is already selected
  if (selectedTimeSlots[tabId] === slotId) {
    // User is clicking the same slot again, deselect it
    selectedTimeSlots[tabId] = null;
    highlightSelectedTimeSlot(tabId, null);
    console.log(`Deselected ${tabId} slot: ${slotId}`);
    
    // Show feedback to user
    if (window.Swal) {
      Swal.fire({
        title: 'Time Slot Deselected',
        text: `You have removed your ${tabId} time slot selection.`,
        icon: 'info',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
    } else {
      // Create a toast notification if SweetAlert is not available
      const toast = document.createElement('div');
      toast.className = 'toast-notification';
      toast.innerHTML = `
        <div class="toast-content">
          <i class="bi bi-info-circle"></i>
          <span>Time slot deselected</span>
        </div>
      `;
      document.body.appendChild(toast);
      
      // Auto-remove after 3 seconds
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 3000);
    }
  } else {
    // Check if there's already a selection for this type
    if (selectedTimeSlots[tabId]) {
      // Ask for confirmation before changing selection
      if (window.Swal) {
        Swal.fire({
          title: 'Change Selection?',
          text: `You've already selected a ${tabId} time slot. Do you want to change it?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Yes, change it',
          cancelButtonText: 'No, keep current selection'
        }).then((result) => {
          if (result.isConfirmed) {
            // Update selected time slot for this tab
            selectedTimeSlots[tabId] = slotId;
            
            // Update visual selection in the tab
            highlightSelectedTimeSlot(tabId, slotId);
            
            // Update the selected time slots summary
            updateSelectedSummary();
            
            // Check for conflicts
            checkTimeSlotConflicts();
          }
        });
      } else {
        const confirmChange = confirm(`You've already selected a ${tabId} time slot. Do you want to change it?`);
        if (confirmChange) {
          // Update selected time slot for this tab
          selectedTimeSlots[tabId] = slotId;
          
          // Update visual selection in the tab
          highlightSelectedTimeSlot(tabId, slotId);
          
          // Update the selected time slots summary
          updateSelectedSummary();
          
          // Check for conflicts
          checkTimeSlotConflicts();
        }
      }
    } else {
      // No previous selection, just select this one
      selectedTimeSlots[tabId] = slotId;
      
      // Update visual selection in the tab
      highlightSelectedTimeSlot(tabId, slotId);
      
      // Update the selected time slots summary
      updateSelectedSummary();
      
      // Check for conflicts
      checkTimeSlotConflicts();
      
      // Show selection confirmation toast
      if (window.Swal) {
        Swal.fire({
          title: 'Time Slot Selected',
          text: `You have selected a ${tabId} time slot.`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
      } else {
        // Create a toast notification if SweetAlert is not available
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.backgroundColor = '#d1e7dd';
        toast.innerHTML = `
          <div class="toast-content">
            <i class="bi bi-check-circle"></i>
            <span>${tabId.charAt(0).toUpperCase() + tabId.slice(1)} time slot selected</span>
          </div>
        `;
        document.body.appendChild(toast);
        
        // Auto-remove after 2 seconds
        setTimeout(() => {
          if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 2000);
      }
    }
  }
}

// Highlight selected time slot in the tab pane
function highlightSelectedTimeSlot(tabId, slotId) {
  // Get the tab element
  const tabElement = document.getElementById(tabId);
  if (!tabElement) {
    console.error(`Tab element not found: ${tabId}`);
    return;
  }
  
  // Remove selection from all cards in this tab
  tabElement.querySelectorAll('.time-slot-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // If no slot ID (deselection), just return after clearing selection
  if (!slotId) {
    console.log(`Cleared selection for ${tabId}`);
    return;
  }
  
  // Add selection to the chosen card
  const selectedCard = tabElement.querySelector(`.time-slot-card[data-slot-id="${slotId}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
    console.log(`Highlighted card for ${tabId} slot: ${slotId}`);
    
    // Make sure the selected card is visible in the scrollable container
    selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    console.error(`Selected card not found for ${tabId} slot: ${slotId}`);
  }
}

// Update the selected time slots summary section
function updateSelectedSummary() {
  const summaryElement = document.getElementById('selectedSummary');
  
  // Check if there are any selections
  const hasSelections = selectedTimeSlots.lecture || selectedTimeSlots.lab || selectedTimeSlots.tutorial;
  
  if (!hasSelections) {
    summaryElement.innerHTML = '<p class="no-selection-message">No time slots selected yet</p>';
    return;
  }
  
  // Build HTML for selected slots
  let html = '';
  
  // Function to add a selected slot to the summary
  const addSlotToSummary = (type, slotId) => {
    if (!slotId) return;
    
    // Find the slot details
    const slotCard = document.querySelector(`.time-slot-card[data-slot-id="${slotId}"]`);
    if (!slotCard) return;
    
    // Get slot info
    const day = slotCard.querySelector('.time-slot-day').textContent;
    const time = slotCard.querySelector('.time-slot-time').textContent;
    const instructor = slotCard.querySelector('.time-slot-instructor').textContent;
    const room = slotCard.querySelector('.time-slot-room').textContent;
    
    // Get seats info if available
    let seatsInfo = '';
    const seatsElement = slotCard.querySelector('.time-slot-seats');
    if (seatsElement) {
      seatsInfo = ` | ${seatsElement.textContent.trim()}`;
    }
    
    html += `
      <div class="selected-slot-item ${type}">
        <div class="selected-slot-info">
          <span class="selected-slot-type">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
          <span class="selected-slot-details">${day} | ${time} | ${room} | ${instructor}${seatsInfo}</span>
        </div>
        <button type="button" class="remove-slot-btn" data-type="${type}">
          <i class="bi bi-x-circle"></i>
        </button>
      </div>
    `;
  };
  
  // Add each selected slot type to the summary
  addSlotToSummary('lecture', selectedTimeSlots.lecture);
  addSlotToSummary('lab', selectedTimeSlots.lab);
  addSlotToSummary('tutorial', selectedTimeSlots.tutorial);
  
  summaryElement.innerHTML = html;
  
  // Add event listeners to remove buttons
  summaryElement.querySelectorAll('.remove-slot-btn').forEach(button => {
    button.addEventListener('click', () => {
      const slotType = button.dataset.type;
      
      // Remove selection
      selectedTimeSlots[slotType] = null;
      
      // Update UI
      highlightSelectedTimeSlot(slotType, null);
      updateSelectedSummary();
      checkTimeSlotConflicts();
    });
  });
}

// Check for time conflicts between selected slots
function checkTimeSlotConflicts() {
  // Reset all conflict indicators
  document.querySelectorAll('.time-slot-card.conflict').forEach(card => {
    card.classList.remove('conflict');
  });
  
  // Get selected slot cards
  const selectedCards = [];
  Object.entries(selectedTimeSlots).forEach(([type, slotId]) => {
    if (slotId) {
      const card = document.querySelector(`.time-slot-card[data-slot-id="${slotId}"]`);
      if (card) selectedCards.push({ type, card, slotId });
    }
  });
  
  // No need to check if fewer than 2 slots selected
  if (selectedCards.length < 2) return;
  
  // Check each pair of slots for conflicts
  for (let i = 0; i < selectedCards.length; i++) {
    for (let j = i + 1; j < selectedCards.length; j++) {
      const slotA = selectedCards[i];
      const slotB = selectedCards[j];
      
      // Skip if not on the same day
      const dayA = slotA.card.querySelector('.time-slot-day').textContent;
      const dayB = slotB.card.querySelector('.time-slot-day').textContent;
      if (dayA !== dayB) continue;
      
      // Get time ranges
      const timeA = slotA.card.querySelector('.time-slot-time').textContent;
      const timeB = slotB.card.querySelector('.time-slot-time').textContent;
      
      // Check if they potentially overlap (simple text comparison, could be improved)
      if (hasTimeOverlap(timeA, timeB)) {
        // Conflict found, mark both cards
        slotA.card.classList.add('conflict');
        slotB.card.classList.add('conflict');
        
        console.warn(`Time conflict detected between ${slotA.type} (${slotA.slotId}) and ${slotB.type} (${slotB.slotId})`);
      }
    }
  }
}

// Helper function to check if two time ranges overlap
function hasTimeOverlap(timeRangeA, timeRangeB) {
  // Parse time ranges like "9:00 AM - 10:30 AM"
  const [startA, endA] = timeRangeA.split(' - ').map(t => parseTimeString(t.trim()));
  const [startB, endB] = timeRangeB.split(' - ').map(t => parseTimeString(t.trim()));
  
  // Check for overlap
  return (startA <= endB && endA >= startB);
}

// Format time from HH:MM:SS to HH:MM AM/PM
function formatTime(timeString) {
  if (!timeString) return '';
  
  // Extract hours and minutes
  const timeParts = timeString.split(':');
  let hours = parseInt(timeParts[0]);
  const minutes = parseInt(timeParts[1]);
  
  // Convert to 12-hour format
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  
  // Format with leading zeros for minutes
  return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// Parse time string like "9:00 AM" to minutes since midnight
function parseTimeString(timeStr) {
  // Extract components
  const [timePart, ampm] = timeStr.split(' ');
  let [hours, minutes] = timePart.split(':').map(Number);
  
  // Adjust for PM
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  // Convert to minutes since midnight
  return hours * 60 + minutes;
}

// Fetch existing time slot selections for the student and course
async function fetchExistingTimeSlots(courseId) {
  try {
    // Get schedule data from the student's overall schedule
    const response = await fetch(`${baseUrl}/schedule/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });
    
    if (!response.ok) {
      // It's okay if there's no schedule yet
      console.log(`No existing schedule found for student ${studentId}, status: ${response.status}`);
      return;
    }
    
    const scheduleData = await response.json();
    console.log("Full schedule data:", scheduleData);
    
    // Find the course we're looking for in the schedule
    const courseSchedule = scheduleData.schedule?.find(item => item.course_id === courseId);
    
    if (courseSchedule && courseSchedule.slots && courseSchedule.slots.length > 0) {
      console.log("Found existing schedule for course:", courseSchedule);
      
      // Reset selected time slots before setting new ones
      selectedTimeSlots = {
        lecture: null,
        lab: null,
        tutorial: null
      };
      
      // Process each slot by its type
      courseSchedule.slots.forEach(slot => {
        if (slot.type.toLowerCase() === 'lecture') {
          selectedTimeSlots.lecture = slot.slot_id;
          highlightSelectedTimeSlot("lecture", slot.slot_id);
        } else if (slot.type.toLowerCase() === 'lab') {
          selectedTimeSlots.lab = slot.slot_id;
          highlightSelectedTimeSlot("lab", slot.slot_id);
        } else if (slot.type.toLowerCase() === 'tutorial') {
          selectedTimeSlots.tutorial = slot.slot_id;
          highlightSelectedTimeSlot("tutorial", slot.slot_id);
        }
      });
      
      // Update selected summary and check for conflicts
      updateSelectedSummary();
      checkTimeSlotConflicts();
    } else {
      console.log("No existing schedule found for this course");
    }
  } catch (error) {
    console.error("Error fetching existing time slots:", error);
    // Non-critical error, we can continue without existing selections
  }
}

// Setup tab navigation in time slot modal
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Initialize first tab as active if not already
  if (!document.querySelector('.tab-btn.active')) {
    tabButtons[0]?.classList.add('active');
    tabPanes[0]?.classList.add('active');
  }
  
  tabButtons.forEach((button, index) => {
    // Remove any existing listeners to prevent duplicates
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    
    // Add click handler
    newButton.addEventListener('click', () => {
      activateTab(newButton.dataset.tab);
    });
    
    // Add keyboard accessibility
    newButton.addEventListener('keydown', (e) => {
      // Enter or Space activates the tab
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(newButton.dataset.tab);
      }
      
      // Arrow keys for navigation between tabs
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = (index + 1) % tabButtons.length;
        tabButtons[nextIndex].focus();
      }
      
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        tabButtons[prevIndex].focus();
      }
    });
    
    // Make tabs focusable
    newButton.setAttribute('tabindex', '0');
    newButton.setAttribute('role', 'tab');
    newButton.setAttribute('aria-selected', newButton.classList.contains('active') ? 'true' : 'false');
    newButton.setAttribute('aria-controls', newButton.dataset.tab);
  });
  
  // Add ARIA attributes to tab content
  tabPanes.forEach(pane => {
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'tab-' + pane.id);
  });
  
  // Add keyboard handler for Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
}

// Helper function to activate a tab
function activateTab(tabId) {
  console.log(`Activating tab: ${tabId}`);
  
  // Remember current scroll position
  const scrollPosition = document.querySelector('.modal-body').scrollTop;
  
  // Remove active class from all buttons and panes
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  
  // Add active class to clicked button and corresponding pane
  const activeButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const activePane = document.getElementById(tabId);
  
  if (activeButton && activePane) {
    activeButton.classList.add('active');
    activeButton.setAttribute('aria-selected', 'true');
    activePane.classList.add('active');
    
    // If there are no time slots in this tab, ensure we show a message
    if (activePane.innerHTML.trim() === '') {
      activePane.innerHTML = '<div class="no-slots-message">No time slots available</div>';
    }
    
    // Maintain scroll position
    setTimeout(() => {
      document.querySelector('.modal-body').scrollTop = scrollPosition;
    }, 10);
  }
}

function closeModal() {
  const modal = document.getElementById("timeSlotModal");
  modal.style.display = "none";
  currentCourseId = null;
}

