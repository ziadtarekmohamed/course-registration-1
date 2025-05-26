// Base API URL
const baseUrl = 'http://localhost:8000/api/v1';

// Debug localStorage information
console.log('StudentDashboard.js loaded');
console.log('localStorage check:');
console.log('token:', !!localStorage.getItem('token'));
console.log('userId:', localStorage.getItem('userId'));
console.log('userRole:', localStorage.getItem('userRole'));
console.log('All localStorage keys:', Object.keys(localStorage));

// Get user data from token
const token = localStorage.getItem('token');
if (!token) {
  console.error('No token found, redirecting to login');
  window.location.href = 'Login.html';
  throw new Error('No access token found');
}

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
const userData = parseJwt(token);
console.log('userData from token:', userData);
const studentId = localStorage.getItem('userId') || userData.user_id;
console.log('Using studentId:', studentId);

// Elements to update
const studentNameElement = document.getElementById('studentName');
const studentIdElement = document.getElementById('studentId');
const studentMajorElement = document.getElementById('studentMajor');
const studentEmailElement = document.getElementById('studentEmail');
const totalCoursesElement = document.getElementById('totalCourses');
const creditHoursElement = document.getElementById('creditHours');
const gpaElement = document.getElementById('gpa');
const currentSemesterElement = document.getElementById('currentSemester');
const upcomingScheduleElement = document.getElementById('upcomingSchedule');
const notificationsElement = document.getElementById('notifications');

// Store data
let studentInfo = {};
let enrollments = [];
let schedule = [];
let currentSemester = "";

// Fetch student information
async function fetchStudentInfo() {
  try {
    const response = await fetch(`${baseUrl}/users/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid
        clearAuthStorage();
        window.location.href = "Login.html";
        return;
      }
      throw new Error("Failed to fetch student information");
    }

    const student = await response.json();
    studentInfo = student;

    // Update student info in the UI
    if (studentNameElement) studentNameElement.textContent = student.name || "Student";
    if (studentIdElement) studentIdElement.textContent = student.student_id || studentId;
    if (studentMajorElement) studentMajorElement.textContent = student.major || "Not specified";
    if (studentEmailElement) studentEmailElement.textContent = student.email || "No email";
    
    // Update academic info
    if (creditHoursElement) creditHoursElement.textContent = student.credit_hours || 0;
    if (gpaElement) gpaElement.textContent = student.GPA || "N/A";

    return student;
  } catch (error) {
    console.error("Error fetching student information:", error);
    displayErrorMessage("Failed to load student information");
  }
}

// Fetch student enrollments
async function fetchEnrollments() {
  try {
    console.log('Fetching enrollments for student:', studentId);
    
    const response = await fetch(`${baseUrl}/enrollments/student/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthStorage();
        window.location.href = "Login.html";
        return;
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to fetch enrollments: ${response.status}`);
    }

    enrollments = await response.json();
    console.log('Received enrollments:', enrollments);
    
    // Filter enrolled courses (Pending or Completed)
    const registeredCourses = enrollments.filter(
      (enrollment) => enrollment.status === "Pending" || enrollment.status === "Completed"
    );

    // Update total courses on the page
    if (totalCoursesElement) totalCoursesElement.textContent = registeredCourses.length;

    // Calculate total credit hours
    const totalCredits = registeredCourses.reduce((total, course) => total + course.credit_hours, 0);
    
    return enrollments;
  } catch (error) {
    console.error("Error fetching enrollments:", error);
    displayErrorMessage(error.message || "Failed to load enrollment information");
    return [];
  }
}

// Fetch current semester settings
async function fetchCurrentSemester() {
  try {
    const response = await fetch(`${baseUrl}/semester/current`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Default if not found
        currentSemester = "Fall 2024";
        if (currentSemesterElement) currentSemesterElement.textContent = currentSemester;
        return currentSemester;
      }
      
      throw new Error("Failed to fetch semester information");
    }

    const semesterData = await response.json();
    currentSemester = `${semesterData.current_semester} ${semesterData.academic_year}`;
    
    if (currentSemesterElement) currentSemesterElement.textContent = currentSemester;
    
    return currentSemester;
  } catch (error) {
    console.error("Error fetching current semester:", error);
    // Set a default value
    currentSemester = "Fall 2024";
    if (currentSemesterElement) currentSemesterElement.textContent = currentSemester;
    return currentSemester;
  }
}

// Fetch student schedule
async function fetchSchedule() {
  try {
    const response = await fetch(`${baseUrl}/schedule/${studentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
    });

    if (!response.ok) {
      // It's okay if there's no schedule yet
      if (response.status === 404) {
        updateUpcomingSchedule([]);
        return [];
      }
      
      throw new Error("Failed to fetch schedule information");
    }

    const scheduleData = await response.json();
    schedule = scheduleData.schedule || [];
    
    // Update upcoming schedule display
    updateUpcomingSchedule(schedule);
    
    return schedule;
  } catch (error) {
    console.error("Error fetching schedule:", error);
    updateUpcomingSchedule([]);
    return [];
  }
}

// Update upcoming schedule section
function updateUpcomingSchedule(scheduleData) {
  if (!upcomingScheduleElement) return;
  
  if (!scheduleData || scheduleData.length === 0) {
    upcomingScheduleElement.innerHTML = '<li class="no-items">No upcoming classes. <a href="StudentRegistration.html">Register for courses</a> to build your schedule.</li>';
    return;
  }
  
  // Sort by date and time
  const sortedSchedule = [...scheduleData].sort((a, b) => {
    const dateComparison = new Date(a.day) - new Date(b.day);
    if (dateComparison !== 0) return dateComparison;
    return a.start_time.localeCompare(b.start_time);
  });
  
  // Take only the next 5 scheduled classes
  const nextClasses = sortedSchedule.slice(0, 5);
  
  // Build the HTML
  const scheduleHTML = nextClasses.map(slot => {
    const courseInfo = enrollments.find(e => e.course_id === slot.course_id) || {};
    const courseName = courseInfo.course_name || slot.course_id;
    
    return `
      <li class="schedule-item">
        <div class="schedule-time">${slot.day} · ${slot.start_time} - ${slot.end_time}</div>
        <div class="schedule-course">
          <strong>${courseName}</strong>
          <span class="schedule-location">${slot.room || 'Room TBA'}</span>
        </div>
      </li>
    `;
  }).join('');
  
  upcomingScheduleElement.innerHTML = scheduleHTML;
}

// Generate notifications
function generateNotifications() {
  if (!notificationsElement) return;
  
  const notifications = [];
  
  // Check credit hours
  if (studentInfo.credit_hours < 12) {
    notifications.push({
      type: 'warning',
      message: 'You have less than 12 credit hours. Consider registering for more courses.'
    });
  }
  
  // Check for upcoming deadlines
  notifications.push({
    type: 'info',
    message: 'Course withdrawal deadline is in 2 weeks.'
  });
  
  // Check for incomplete enrollments
  const pendingEnrollments = enrollments.filter(e => e.status === "Pending" && !schedule.some(s => s.course_id === e.course_id));
  if (pendingEnrollments.length > 0) {
    notifications.push({
      type: 'alert',
      message: `You have ${pendingEnrollments.length} course(s) without selected time slots.`
    });
  }
  
  // Display notifications
  if (notifications.length === 0) {
    notificationsElement.innerHTML = '<li class="no-items">No new notifications.</li>';
    return;
  }
  
  const notificationsHTML = notifications.map(notification => {
    return `
      <li class="notification-item ${notification.type}">
        <i class="bi ${getNotificationIcon(notification.type)}"></i>
        <span>${notification.message}</span>
      </li>
    `;
  }).join('');
  
  notificationsElement.innerHTML = notificationsHTML;
}

// Get appropriate icon for notification type
function getNotificationIcon(type) {
  switch (type) {
    case 'warning': return 'bi-exclamation-triangle-fill';
    case 'alert': return 'bi-exclamation-circle-fill';
    case 'success': return 'bi-check-circle-fill';
    case 'info':
    default: return 'bi-info-circle-fill';
  }
}

// Show error message to user
function displayErrorMessage(message) {
  // Could use a toast or notification system instead of alert
  console.error(message);
  
  // Add error to notifications panel instead of alert
  if (notificationsElement) {
    const errorNotification = `
      <li class="notification-item alert">
        <i class="bi bi-exclamation-circle-fill"></i>
        <span>${message}</span>
      </li>
    `;
    
    // Prepend to notifications
    notificationsElement.innerHTML = errorNotification + notificationsElement.innerHTML;
  } else {
    alert(message);
  }
}

// Initialize the dashboard
async function initDashboard() {
  try {
    // Fetch student data
    await fetchStudentInfo();
    
    // Fetch semester data
    await fetchCurrentSemester();
    
    // Fetch enrollments and schedule data in parallel
    const [enrollmentsData, scheduleData] = await Promise.all([
      fetchEnrollments(),
      fetchSchedule()
    ]);
    
    // Generate notifications
    generateNotifications();
    
    // Add event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error("Dashboard initialization error:", error);
    displayErrorMessage("Failed to initialize dashboard. Please try refreshing the page.");
  }
}

// Setup event listeners
function setupEventListeners() {
  // Logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }
}

// Function to clear authentication storage
function clearAuthStorage() {
  console.log('Clearing auth storage');
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userId");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userName");
}

// Logout function
function logout() {
  localStorage.clear();
  window.location.href = "Login.html";
}

// Start initialization when document is ready
document.addEventListener("DOMContentLoaded", initDashboard); 