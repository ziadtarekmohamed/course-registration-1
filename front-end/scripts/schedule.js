// schedule.js - Frontend script for the Schedule page

// Base API URL
const baseUrl = 'http://localhost:8000/api/v1';

// Add script import for real-time updates at the top of the file
const realtimeScript = document.createElement('script');
realtimeScript.type = 'module';
realtimeScript.innerHTML = `
    import { subscribeToScheduleUpdates, subscribeToTimeSlotUpdates } from './realtime.js';
    window.subscribeToScheduleUpdates = subscribeToScheduleUpdates;
    window.subscribeToTimeSlotUpdates = subscribeToTimeSlotUpdates;
`;
document.head.appendChild(realtimeScript);

document.addEventListener('DOMContentLoaded', function() {
    // Debug: Check token and user info
    console.log('Schedule.js loaded');
    console.log('Token exists:', !!localStorage.getItem('token'));
    console.log('User ID:', localStorage.getItem('userId'));
    console.log('User Role:', localStorage.getItem('userRole'));
    
    try {
        // Parse the token to validate it
        const token = localStorage.getItem('token');
        if (token) {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                console.log('Token payload valid:', !!payload);
                console.log('Token exp:', new Date(payload.exp * 1000));
                // Fix the token expiration check - compare timestamps not boolean
                const isExpired = new Date(payload.exp * 1000) < new Date();
                console.log('Token expired:', isExpired);
                
                // Redirect to login if token is expired
                if (isExpired) {
                    console.log('Token is expired, redirecting to login');
                    localStorage.clear();
                    window.location.href = 'Login.html';
                    return;
                }
            } else {
                console.error('Invalid token format');
                redirectToLogin();
                return;
            }
        } else {
            redirectToLogin();
            return;
        }
    } catch (error) {
        console.error('Error parsing token:', error);
        redirectToLogin();
        return;
    }
    
    // Add custom styles for schedule slots
    addScheduleStyles();
    
    loadUserInfo();
    setupEventListeners();
    loadScheduleData();
    
    // Add quick filter bar and course detail clicks
    setTimeout(() => {
        addQuickFilterBar();
        setupCourseDetailClicks();
        
        // Set up real-time updates for schedule data
        setupRealTimeUpdates();
    }, 1000); // Small delay to ensure the schedule data is loaded
});

// Helper function to redirect to login
function redirectToLogin() {
    console.log('Authentication issue, redirecting to login');
    localStorage.clear();
    window.location.href = 'Login.html';
}

// Token handling
function getToken() {
    return localStorage.getItem('token');
}

function getUserId() {
    return localStorage.getItem('userId');
}

function getUserRole() {
    return localStorage.getItem('userRole');
}

// User info and logout
function loadUserInfo() {
    const token = getToken();
    if (!token) {
        console.log('No token found, redirecting to login page');
        window.location.href = 'Login.html';
        return;
    }

    // Handle logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        console.log('Logging out...');
        localStorage.clear(); // Clear all localStorage items
        window.location.href = 'Login.html';
    });
}

function setupEventListeners() {
    // Semester selector event listener
    const semesterSelect = document.getElementById('semester-select');
    if (semesterSelect) {
        semesterSelect.addEventListener('change', function() {
            loadScheduleData(this.value);
        });
    }
}

// Helper function to show loading indicator
function showLoading(message) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-overlay';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-message">${message || 'Loading...'}</div>
    `;
    document.body.appendChild(loadingDiv);
    return loadingDiv;
}

// Helper function to close loading indicator
function closeLoading(loadingDiv) {
    if (loadingDiv && loadingDiv.parentNode) {
        loadingDiv.parentNode.removeChild(loadingDiv);
    }
}

// Helper function to show error message
function showError(message) {
    if (window.Swal) {
        Swal.fire({
            title: 'Error',
            text: message,
            icon: 'error',
            confirmButtonText: 'OK'
        });
    } else {
        alert(message);
    }
}

// Set up real-time updates for the schedule
function setupRealTimeUpdates() {
    const userId = getUserId();
    if (!userId) return;
    
    console.log('Setting up real-time updates for schedule');
    
    // Check if the real-time module is available
    if (window.subscribeToScheduleUpdates) {
        // Subscribe to schedule updates for this student
        window.subscribeToScheduleUpdates(userId, handleScheduleUpdate)
            .then(() => {
                console.log('Subscribed to real-time schedule updates');
            })
            .catch(error => {
                console.error('Failed to subscribe to schedule updates:', error);
            });
    } else {
        console.warn('Real-time module not available');
    }
}

// Handle real-time schedule updates
function handleScheduleUpdate(data) {
    console.log('Received real-time schedule update:', data);
    
    // Check the operation type
    const operation = data.operation;
    
    if (operation === 'insert' || operation === 'replace') {
        // A new schedule has been created or completely replaced
        // Reload the entire schedule
        loadScheduleData();
    } 
    else if (operation === 'update') {
        // Only specific fields of the schedule have been updated
        // We can apply targeted updates to the UI based on the updated fields
        const updatedFields = data.updated_fields || {};
        
        // Check if any relevant fields have been updated
        if (updatedFields.schedule || 
            updatedFields.total_courses !== undefined || 
            updatedFields.total_credit_hours !== undefined || 
            updatedFields.weekly_class_hours !== undefined) {
            
            // For schedule updates, reload the entire schedule
            // This is a safer approach than trying to patch the UI
            loadScheduleData();
        }
    } 
    else if (operation === 'delete') {
        // The schedule has been deleted
        // Clear the schedule display
        clearScheduleTable(document.querySelector('.schedule-table tbody'));
        displayEmptyScheduleMessage();
    }
}

// Main function to load schedule data
async function loadScheduleData(semester = 'current') {
    const loading = showLoading('Loading your schedule...');
    try {
        const userId = getUserId();
        const token = getToken();
        
        if (!userId || !token) {
            showError('User ID or token not found. Please log in again.');
            redirectToLogin();
            return;
        }

        // Try to get the active semester, but don't fail if endpoint doesn't exist
        let semesterId = semester;
        if (semester === 'current') {
            try {
                const semesterResponse = await fetch(`${baseUrl}/semester/active`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (semesterResponse.ok) {
                    const semesterData = await semesterResponse.json();
                    semesterId = semesterData.semester_id;
                    console.log('Active semester:', semesterId);
                } else {
                    console.warn('Could not fetch active semester, using selected value instead');
                }
            } catch (error) {
                console.warn('Error fetching active semester:', error);
            }
        }

        // First try to fetch student-specific schedule data
        console.log('Fetching student schedule from:', `${baseUrl}/schedule/student/${userId}`);
        
        let response = await fetch(`${baseUrl}/schedule/student/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // If student-specific endpoint fails, try the generic endpoint
        if (!response.ok && response.status !== 404) {
            console.log('Student-specific schedule endpoint failed, trying generic endpoint');
            response = await fetch(`${baseUrl}/schedule/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        
        // Handle response status
        if (response.status === 401 || response.status === 403) {
            console.error('Authentication error:', response.status);
            // Token might be invalid or expired
            throw new Error('Your session has expired. Please log in again.');
        }
        
        if (response.status === 404) {
            console.warn('Schedule endpoint returned 404. Trying alternative endpoints.');
            return await tryAlternativeEndpoints(userId, semesterId);
        }
        
        if (!response.ok) {
            throw new Error(`Failed to fetch schedule data: ${response.status} ${response.statusText}`);
        }

        const scheduleData = await response.json();
        console.log('Schedule data received from API:', scheduleData);
        
        // Validate and sanitize the data
        const validatedData = validateScheduleData(scheduleData);
        if (!validatedData) {
            throw new Error('Invalid schedule data format received from API');
        }
        
        // Update UI with the real data
        updateScheduleUI(validatedData);
        updateScheduleMetrics(validatedData);
        
        // Set up real-time updates for each course in the schedule
        setupCourseTimeSlotUpdates(validatedData);
    } catch (error) {
        console.error('Error loading schedule:', error);
        
        // Try alternative endpoints before falling back to mock data
        try {
            const alternativeResult = await tryAlternativeEndpoints(getUserId(), semesterId);
            if (alternativeResult) return; // Successfully got data from alternative endpoint
        } catch (altError) {
            console.error('Alternative endpoints also failed:', altError);
        }
        
        // If error is about authentication, redirect to login
        if (error.message.includes('session has expired') || 
            error.message.includes('log in again')) {
            showError(error.message);
            setTimeout(() => redirectToLogin(), 2000);
            return;
        }
        
        // Show error to user
        showError('Failed to load schedule: ' + error.message);
        
        // Only use mock data in development environment, not in production
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('Using mock data as fallback (development only)');
            const mockScheduleData = generateMockScheduleData();
            updateScheduleUI(mockScheduleData);
            updateScheduleMetrics(mockScheduleData);
        }
    } finally {
        closeLoading(loading);
    }
}

// Set up real-time updates for individual courses in the schedule
function setupCourseTimeSlotUpdates(scheduleData) {
    // Check if real-time module is available
    if (!window.subscribeToTimeSlotUpdates) {
        console.warn('Real-time module not available for time slot updates');
        return;
    }
    
    // Extract unique course IDs from the schedule
    const courseIds = new Set();
    
    if (scheduleData && scheduleData.schedule) {
        // Iterate through each day in the schedule
        Object.values(scheduleData.schedule).forEach(slots => {
            if (Array.isArray(slots)) {
                // Add each course ID to the set
                slots.forEach(slot => {
                    if (slot.course_id) {
                        courseIds.add(slot.course_id);
                    }
                });
            }
        });
    }
    
    // Subscribe to time slot updates for each course
    courseIds.forEach(courseId => {
        window.subscribeToTimeSlotUpdates(courseId, handleTimeSlotUpdate)
            .then(() => {
                console.log(`Subscribed to time slot updates for course ${courseId}`);
            })
            .catch(error => {
                console.error(`Failed to subscribe to time slot updates for course ${courseId}:`, error);
            });
    });
}

// Handle real-time time slot updates
function handleTimeSlotUpdate(data) {
    console.log('Received real-time time slot update:', data);
    
    // For time slot updates, the simplest approach is to reload the schedule
    // This ensures all data is consistent
    loadScheduleData();
}

// Try alternative endpoints to get schedule data
async function tryAlternativeEndpoints(userId, semesterId) {
    console.log('Trying alternative endpoints for schedule data');
    const token = getToken();
    
    if (!token || !userId) {
        console.error('Missing token or userId for alternative endpoints');
        return false;
    }
    
    // Try endpoint 1: Direct student schedule endpoint 
    try {
        const response1 = await fetch(`${baseUrl}/schedule/student/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response1.ok) {
            const data = await response1.json();
            console.log('Got schedule from alternative endpoint 1:', data);
            updateScheduleUI(data);
            updateScheduleMetrics(data);
            return true;
        }
    } catch (err) {
        console.warn('Alternative endpoint 1 failed:', err);
    }
    
    // Try endpoint 2: Time slots by courses the student is enrolled in
    try {
        // First get enrolled courses
        const enrollmentsResponse = await fetch(`${baseUrl}/enrollments/student/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (enrollmentsResponse.ok) {
            const enrollments = await enrollmentsResponse.json();
            
            if (enrollments && enrollments.length > 0) {
                // Create a merged schedule from all course time slots
                const schedule = { schedule: {} };
                
                // For each enrollment, get time slots
                for (const enrollment of enrollments) {
                    const courseId = enrollment.course_id;
                    
                    // Get course details for name
                    let courseName = `Course ${courseId}`;
                    try {
                        const courseResponse = await fetch(`${baseUrl}/courses/${courseId}`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (courseResponse.ok) {
                            const courseData = await courseResponse.json();
                            courseName = courseData.name || courseName;
                        }
                    } catch (error) {
                        console.warn(`Could not fetch course name for ${courseId}:`, error);
                    }
                    
                    // Get time slots for this course
                    const slotsResponse = await fetch(`${baseUrl}/time-slots/course/${courseId}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (slotsResponse.ok) {
                        let slots = await slotsResponse.json();
                        
                        // Enhance slots with course name and proper room info
                        slots = slots.map(slot => {
                            // Add course name if missing
                            if (!slot.course_name) {
                                slot.course_name = courseName;
                            }
                            
                            // Format room name if needed
                            if (!slot.room_name && slot.room_id) {
                                slot.room_name = `Room ${slot.room_id}`;
                            }
                            
                            return slot;
                        });
                        
                        // Group slots by day
                        for (const slot of slots) {
                            const day = slot.day;
                            if (!schedule.schedule[day]) {
                                schedule.schedule[day] = [];
                            }
                            schedule.schedule[day].push(slot);
                        }
                    }
                }
                
                // Calculate statistics
                schedule.total_courses = enrollments.length;
                schedule.total_credit_hours = enrollments.reduce((total, e) => total + (e.credit_hours || 0), 0);
                schedule.weekly_class_hours = calculateWeeklyHours(schedule.schedule);
                
                console.log('Created schedule from enrollments:', schedule);
                updateScheduleUI(schedule);
                updateScheduleMetrics(schedule);
                return true;
            }
        }
    } catch (err) {
        console.warn('Alternative endpoint 2 failed:', err);
    }
    
    // Try endpoint 3: Time slots endpoint directly
    try {
        const timeSlotsResponse = await fetch(`${baseUrl}/time-slots/student/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (timeSlotsResponse.ok) {
            const timeSlots = await timeSlotsResponse.json();
            
            if (timeSlots && timeSlots.length > 0) {
                // Convert to expected format
                const schedule = { schedule: {} };
                
                // Group by day and enhance data
                for (const slot of timeSlots) {
                    // Try to get course details if missing
                    if (!slot.course_name && slot.course_id) {
                        try {
                            const courseResponse = await fetch(`${baseUrl}/courses/${slot.course_id}`, {
                                method: 'GET',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (courseResponse.ok) {
                                const courseData = await courseResponse.json();
                                slot.course_name = courseData.name || `Course ${slot.course_id}`;
                            }
                        } catch (error) {
                            console.warn(`Could not fetch course name for ${slot.course_id}:`, error);
                            slot.course_name = `Course ${slot.course_id}`;
                        }
                    }
                    
                    // Format room info if missing
                    if (!slot.room_name && slot.room_id) {
                        try {
                            const roomResponse = await fetch(`${baseUrl}/rooms/${slot.room_id}`, {
                                method: 'GET',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (roomResponse.ok) {
                                const roomData = await roomResponse.json();
                                slot.room_name = `${roomData.building}-${roomData.room_number}`;
                            } else {
                                slot.room_name = `Room ${slot.room_id}`;
                            }
                        } catch (error) {
                            console.warn(`Could not fetch room info for ${slot.room_id}:`, error);
                            slot.room_name = `Room ${slot.room_id}`;
                        }
                    }
                    
                    const day = slot.day;
                    if (!schedule.schedule[day]) {
                        schedule.schedule[day] = [];
                    }
                    schedule.schedule[day].push(slot);
                }
                
                // Set metrics
                schedule.total_courses = new Set(timeSlots.map(s => s.course_id)).size;
                schedule.total_credit_hours = 0; // Cannot determine from time slots alone
                schedule.weekly_class_hours = calculateWeeklyHours(schedule.schedule);
                
                console.log('Created schedule from time slots:', schedule);
                updateScheduleUI(schedule);
                updateScheduleMetrics(schedule);
                return true;
            }
        }
    } catch (err) {
        console.warn('Alternative endpoint 3 failed:', err);
    }
    
    return false;
}

// Helper function to calculate weekly hours from schedule
function calculateWeeklyHours(schedule) {
    let totalHours = 0;
    
    // Iterate through each day in the schedule
    Object.values(schedule).forEach(slots => {
        // Add up the duration of each slot
        slots.forEach(slot => {
            const duration = calculateDuration(slot.start_time, slot.end_time);
            totalHours += duration / 60; // Convert minutes to hours
        });
    });
    
    return totalHours;
}

// Validate and sanitize schedule data
function validateScheduleData(data) {
    if (!data) return null;
    
    // If the data doesn't have a schedule property, check if it might be in a different format
    if (!data.schedule) {
        // Try to adapt the data format
        if (Array.isArray(data)) {
            // If it's an array of slots, group by day
            const schedule = {};
            
            data.forEach(slot => {
                // Ensure each slot has course_name and room_name if possible
                if (!slot.course_name && slot.course_id) {
                    // We could fetch course info here, but for now let's use the ID
                    slot.course_name = `Course ${slot.course_id}`;
                }
                
                if (!slot.room_name && slot.room_id) {
                    slot.room_name = `Room ${slot.room_id}`;
                }
                
                const day = slot.day;
                if (!schedule[day]) {
                    schedule[day] = [];
                }
                schedule[day].push(slot);
            });
            
            return {
                schedule: schedule,
                total_courses: new Set(data.map(slot => slot.course_id)).size,
                total_credit_hours: 0, // Can't determine from this data
                weekly_class_hours: 0  // Would need to calculate
            };
        }
        
        // Check if data has days as direct properties (flat structure)
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        let hasDirectDays = false;
        
        for (const day of days) {
            if (Array.isArray(data[day])) {
                hasDirectDays = true;
                break;
            }
        }
        
        if (hasDirectDays) {
            return {
                schedule: {
                    Monday: Array.isArray(data.Monday) ? data.Monday : [],
                    Tuesday: Array.isArray(data.Tuesday) ? data.Tuesday : [],
                    Wednesday: Array.isArray(data.Wednesday) ? data.Wednesday : [],
                    Thursday: Array.isArray(data.Thursday) ? data.Thursday : [],
                    Friday: Array.isArray(data.Friday) ? data.Friday : [],
                    Saturday: Array.isArray(data.Saturday) ? data.Saturday : [],
                    Sunday: Array.isArray(data.Sunday) ? data.Sunday : []
                },
                total_courses: data.total_courses || 0,
                total_credit_hours: data.total_credit_hours || 0,
                weekly_class_hours: data.weekly_class_hours || 0
            };
        }
        
        console.warn('Could not adapt data format:', data);
        return null;
    }
    
    return data;
}

// Generate mock schedule data for development/demo purposes
function generateMockScheduleData() {
    return {
        student_id: getUserId(),
        semester: "Fall 2023",
        total_courses: 4,
        total_credit_hours: 12,
        weekly_class_hours: 16.5,
        schedule: {
            "Monday": [
                {
                    slot_id: "mock-l1",
                    course_id: "CSE101",
                    course_name: "Introduction to Computer Science",
                    day: "Monday",
                    start_time: "08:30",
                    end_time: "10:00",
                    type: "Lecture",
                    room_id: "A101",
                    room_name: "Building A - Room 101",
                    instructor_name: "Dr. Smith"
                },
                {
                    slot_id: "mock-t1",
                    course_id: "MTH201",
                    course_name: "Calculus I",
                    day: "Monday",
                    start_time: "13:00",
                    end_time: "14:30",
                    type: "Tutorial",
                    room_id: "B202",
                    room_name: "Building B - Room 202",
                    instructor_name: "TA Johnson"
                }
            ],
            "Tuesday": [
                {
                    slot_id: "mock-lab1",
                    course_id: "CSE101",
                    course_name: "Introduction to Computer Science",
                    day: "Tuesday",
                    start_time: "09:00",
                    end_time: "11:00",
                    type: "Lab",
                    room_id: "C303",
                    room_name: "Lab Building - Room 303",
                    instructor_name: "TA Davis"
                }
            ],
            "Wednesday": [
                {
                    slot_id: "mock-l2",
                    course_id: "PHY101",
                    course_name: "Physics I",
                    day: "Wednesday",
                    start_time: "10:30",
                    end_time: "12:00",
                    type: "Lecture",
                    room_id: "A105",
                    room_name: "Building A - Room 105",
                    instructor_name: "Dr. Wilson"
                }
            ],
            "Thursday": [
                {
                    slot_id: "mock-l3",
                    course_id: "ENG101",
                    course_name: "English Composition",
                    day: "Thursday",
                    start_time: "14:00",
                    end_time: "15:30",
                    type: "Lecture",
                    room_id: "D401",
                    room_name: "Building D - Room 401",
                    instructor_name: "Prof. Miller"
                }
            ],
            "Friday": [],
            "Saturday": [],
            "Sunday": []
        }
    };
}

// Update the schedule table with data from the API
function updateScheduleUI(scheduleData) {
    const scheduleTable = document.querySelector('.schedule-table tbody');
    if (!scheduleTable) {
        console.error('Schedule table not found in DOM');
        return;
    }

    // First, clear all existing content from the schedule table
    clearScheduleTable(scheduleTable);

    // Check if we have schedule data
    if (!scheduleData || !scheduleData.schedule) {
        console.log('No schedule data found for this semester.');
        displayEmptyScheduleMessage();
        return;
    }

    // Check if we have any time slots in the schedule
    let hasTimeSlots = false;
    Object.values(scheduleData.schedule).forEach(slots => {
        if (slots && slots.length > 0) {
            hasTimeSlots = true;
        }
    });

    if (!hasTimeSlots) {
        console.log('No time slots found in schedule.');
        displayEmptyScheduleMessage();
        return;
    }

    // Process schedule data by day
    Object.entries(scheduleData.schedule).forEach(([day, slots]) => {
        if (!slots || slots.length === 0) return;
        
        slots.forEach(slot => {
            try {
                addSlotToSchedule(scheduleTable, slot, day);
            } catch (error) {
                console.error(`Error adding slot to schedule: ${error.message}`, slot);
            }
        });
    });
}

// Helper function to clear the schedule table
function clearScheduleTable(scheduleTable) {
    const rows = scheduleTable.querySelectorAll('tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td:not(.time-cell)');
        cells.forEach(cell => {
            cell.innerHTML = '';
            cell.removeAttribute('rowspan');
            cell.className = '';
        });
    });
    
    // Remove any empty schedule message
    const emptyMessage = document.querySelector('.empty-schedule');
    if (emptyMessage) {
        emptyMessage.remove();
    }
}

// Helper function to display empty schedule message
function displayEmptyScheduleMessage() {
    const scheduleContainer = document.querySelector('.schedule-container');
    const scheduleTable = document.querySelector('.schedule-table');
    
    if (scheduleContainer && scheduleTable && !document.querySelector('.empty-schedule')) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-schedule';
        emptyMessage.innerHTML = `
            <i class="bi bi-calendar-x"></i>
            <p>You don't have any scheduled classes yet.</p>
            <p>Register for courses and select time slots to see them on your schedule.</p>
            <button id="registerNowBtn" class="btn-primary">Register for Courses</button>
        `;
        
        // Insert the message before the table
        scheduleContainer.insertBefore(emptyMessage, scheduleTable);
        
        // Add event listener to the Register Now button
        const registerBtn = document.getElementById('registerNowBtn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                window.location.href = 'StudentRegistration.html';
            });
        }
    }
}

// Helper function to add a slot to the schedule
function addSlotToSchedule(scheduleTable, slot, day) {
    // Extract slot details
    const { 
        course_id, 
        course_name, 
        start_time, 
        end_time, 
        type, 
        room_id,
        room_name, 
        instructor_name,
        slot_id // Make sure we get the slot_id
    } = slot;
    
    // Format type to handle inconsistent casing
    const formattedType = type ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase() : 'Unknown';
            
    // Find the right row (by time) and column (by day)
    const rowIndex = findTimeRowIndex(start_time);
    const colIndex = findDayColumnIndex(day);
    
    console.log(`Adding slot: ${day} at ${start_time}, rowIndex=${rowIndex}, colIndex=${colIndex}, course=${course_name || course_id}`);
            
    if (rowIndex >= 0 && colIndex >= 0) {
        const rows = scheduleTable.querySelectorAll('tr');
        const row = rows[rowIndex];
        if (!row) {
            console.warn(`Row not found for index ${rowIndex}`);
            return;
        }
                
        const cell = row.children[colIndex];
        if (!cell) {
            console.warn(`Cell not found at column ${colIndex} in row ${rowIndex}`);
            return;
        }
                
        // Calculate rowspan based on duration
        const duration = calculateDuration(start_time, end_time);
        const rowSpan = Math.max(1, Math.ceil(duration / 60)); // Assuming 1 hour per row, minimum 1
                
        if (rowSpan > 1) {
            cell.setAttribute('rowspan', rowSpan);
            
            // Clear cells below that would be covered by this rowspan
            for (let i = 1; i < rowSpan && (rowIndex + i) < rows.length; i++) {
                const rowBelow = rows[rowIndex + i];
                if (rowBelow && rowBelow.children[colIndex]) {
                    rowBelow.removeChild(rowBelow.children[colIndex]);
                }
            }
        }
        
        // Format times for display
        const displayStartTime = formatTimeForDisplay(start_time);
        const displayEndTime = formatTimeForDisplay(end_time);
        const timeRange = `${displayStartTime} - ${displayEndTime}`;
                
        // Add CSS class based on type
        cell.className = `course-slot ${formattedType.toLowerCase()}`;
        
        // Add data-slot-id attribute so we can identify the specific slot
        if (slot_id) {
            cell.setAttribute('data-slot-id', slot_id);
        }
        
        // Format room information
        let roomDisplay = '';
        if (room_name) {
            roomDisplay = room_name;
        } else if (room_id) {
            roomDisplay = `Room ${room_id}`;
        } else {
            roomDisplay = 'No Room Assigned';
        }
                
        // Create course details - show course name prominently and improve room display
        cell.innerHTML = `
            <div class="course-details">
                <h3>${course_name || 'Unnamed Course'}</h3>
                <div class="course-id">${course_id}</div>
                <div class="course-time">${timeRange}</div>
                <div class="course-location"><i class="bi bi-building"></i> ${roomDisplay}</div>
                <div class="course-instructor"><i class="bi bi-person"></i> ${instructor_name || 'No Instructor'}</div>
                <div class="course-type-badge">${formattedType}</div>
            </div>
        `;
    } else {
        console.warn(`Invalid row/column index: row=${rowIndex}, col=${colIndex} for ${day} at ${start_time}`);
    }
}

// Format time for display (HH:MM to H:MM AM/PM)
function formatTimeForDisplay(timeStr) {
    if (!timeStr) return '';
    
    try {
        // Normalize time format first
        const normalizedTime = normalizeTimeFormat(timeStr);
        const [hourStr, minutesStr] = normalizedTime.split(':');
        
        const hour = parseInt(hourStr);
        const minutes = parseInt(minutesStr);
        
        // Convert to 12-hour format
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12; // Convert 0 to 12
        
        // Format with leading zero for minutes
        return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch (e) {
        console.error('Error formatting time for display:', e, timeStr);
        return timeStr; // Return original if error
    }
}

// Update the schedule metrics at the top of the page
function updateScheduleMetrics(scheduleData) {
    try {
        // Update metrics cards if data is available
        if (scheduleData) {
            // Count unique courses
            const totalCoursesElement = document.querySelector('.info-card:nth-child(1) .number');
            if (totalCoursesElement) {
                totalCoursesElement.textContent = scheduleData.total_courses || 0;
            }
            
            // Show total credit hours
            const creditHoursElement = document.querySelector('.info-card:nth-child(2) .number');
            if (creditHoursElement) {
                creditHoursElement.textContent = scheduleData.total_credit_hours || 0;
            }
            
            // Show weekly class hours
            const weeklyHoursElement = document.querySelector('.info-card:nth-child(3) .number');
            if (weeklyHoursElement) {
                weeklyHoursElement.textContent = scheduleData.weekly_class_hours?.toFixed(1) || 0;
            }
            
            // Update semester display if available
            const semesterSelect = document.getElementById('semester-select');
            if (semesterSelect && scheduleData.semester) {
                // Try to find and select the option that matches the semester
                const options = semesterSelect.options;
                for (let i = 0; i < options.length; i++) {
                    if (options[i].value.toLowerCase() === scheduleData.semester.toLowerCase()) {
                        semesterSelect.selectedIndex = i;
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error updating schedule metrics:', error);
    }
}

// Helper function to find row index based on time
function findTimeRowIndex(timeStr) {
    // First normalize the time format
    let normalizedTime = normalizeTimeFormat(timeStr);
    
    // Standard time rows with 1-hour gaps
    const timeRows = {
        '07:00': 0, '7:00': 0,
        '07:30': 0, '7:30': 0,
        '08:00': 1, '8:00': 1,
        '08:30': 1, '8:30': 1,
        '09:00': 2, '9:00': 2,
        '09:30': 2, '9:30': 2,
        '10:00': 3,
        '10:30': 3,
        '11:00': 4,
        '11:30': 4,
        '12:00': 5,
        '12:30': 5,
        '13:00': 6, '1:00': 6,
        '13:30': 6, '1:30': 6,
        '14:00': 7, '2:00': 7,
        '14:30': 7, '2:30': 7,
        '15:00': 8, '3:00': 8,
        '15:30': 8, '3:30': 8,
        '16:00': 9, '4:00': 9,
        '16:30': 9, '4:30': 9,
        '17:00': 10, '5:00': 10,
        '17:30': 10, '5:30': 10
    };
    
    // For debugging
    console.log(`Finding row for time: ${timeStr} (normalized: ${normalizedTime})`);
    
    // Try exact match first
    if (timeRows[normalizedTime] !== undefined) {
        return timeRows[normalizedTime];
    }
    
    // If no exact match, find the closest time row
    // Extract hour and minutes for comparison
    const [hourStr, minutesStr] = normalizedTime.split(':');
    const timeValue = parseInt(hourStr) * 60 + parseInt(minutesStr);
    
    // Find the earliest time slot that can contain this time
    let closestRowIndex = -1;
    let smallestDifference = Number.MAX_SAFE_INTEGER;
    
    Object.entries(timeRows).forEach(([rowTime, rowIndex]) => {
        const [rowHourStr, rowMinutesStr] = rowTime.split(':');
        const rowTimeValue = parseInt(rowHourStr) * 60 + parseInt(rowMinutesStr);
        
        // Calculate difference - we want the closest earlier time
        const difference = timeValue - rowTimeValue;
        
        // Only consider earlier or equal times that are within 60 minutes
        if (difference >= 0 && difference < 60 && difference < smallestDifference) {
            smallestDifference = difference;
            closestRowIndex = rowIndex;
        }
    });
    
    if (closestRowIndex !== -1) {
        console.log(`Using closest time row with index ${closestRowIndex} for ${normalizedTime}`);
        return closestRowIndex;
    }
    
    // If time is after all defined rows, use the last row
    if (timeValue > 1050) { // 17:30 in minutes
        const lastIndex = Math.max(...Object.values(timeRows));
        console.log(`Time ${normalizedTime} is after all defined rows, using last row index ${lastIndex}`);
        return lastIndex;
    }
    
    // If time is before all defined rows, use the first row
    if (timeValue < 420) { // 07:00 in minutes
        console.log(`Time ${normalizedTime} is before all defined rows, using first row index 0`);
        return 0;
    }
    
    // Fallback
    console.warn(`Could not find appropriate row for time: ${timeStr}`);
    return 0;
}

// Helper function to normalize time format to HH:MM
function normalizeTimeFormat(timeStr) {
    if (!timeStr) return '00:00';
    
    try {
        // Handle different time formats
        if (typeof timeStr === 'string') {
            // Remove any non-digit or colon characters
            const cleanTimeStr = timeStr.replace(/[^\d:]/g, '');
            const parts = cleanTimeStr.split(':');
            
            // Handle cases like "7" (just hours)
            if (parts.length === 1) {
                const hour = parseInt(parts[0]);
                return `${hour.toString().padStart(2, '0')}:00`;
            }
            
            // Normal case like "7:30"
            const hour = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        } 
        else if (timeStr instanceof Date) {
            return `${timeStr.getHours().toString().padStart(2, '0')}:${timeStr.getMinutes().toString().padStart(2, '0')}`;
        }
        
        return '00:00'; // Default
    } catch (e) {
        console.error('Error normalizing time format:', e, timeStr);
        return '00:00';
    }
}

// Helper function to find column index based on day
function findDayColumnIndex(day) {
    const dayColumns = {
        'Sunday': 1,
        'Monday': 2,
        'Tuesday': 3,
        'Wednesday': 4,
        'Thursday': 5,
        'Friday': 6,
        'Saturday': 7
    };
    return dayColumns[day] !== undefined ? dayColumns[day] : -1;
}

// Calculate duration between start and end time in minutes
function calculateDuration(startTime, endTime) {
    try {
        // Process time strings
        let startMinutes, endMinutes;
        
        if (typeof startTime === 'string') {
            const [startHour, startMin] = startTime.split(':').map(Number);
            startMinutes = (startHour * 60) + (startMin || 0);
        } else if (startTime instanceof Date) {
            startMinutes = (startTime.getHours() * 60) + startTime.getMinutes();
        } else {
            throw new Error('Invalid start time format');
        }
        
        if (typeof endTime === 'string') {
            const [endHour, endMin] = endTime.split(':').map(Number);
            endMinutes = (endHour * 60) + (endMin || 0);
        } else if (endTime instanceof Date) {
            endMinutes = (endTime.getHours() * 60) + endTime.getMinutes();
        } else {
            throw new Error('Invalid end time format');
        }
        
        return endMinutes - startMinutes;
    } catch (error) {
        console.error('Error calculating duration:', error, startTime, endTime);
        return 60; // Default to 1 hour if calculation fails
    }
}

// Add a quick filter option bar for schedule view
function addQuickFilterBar() {
    const header = document.querySelector('.header');
    if (!header) return;
    
    // Create quick filter container if it doesn't exist
    if (!document.querySelector('.quick-filters')) {
        const quickFilters = document.createElement('div');
        quickFilters.className = 'quick-filters';
        quickFilters.innerHTML = `
            <div class="filter-label">Quick Filters:</div>
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="lecture">Lectures</button>
            <button class="filter-btn" data-filter="lab">Labs</button>
            <button class="filter-btn" data-filter="tutorial">Tutorials</button>
        `;
        
        // Insert after the header
        header.parentNode.insertBefore(quickFilters, header.nextSibling);
        
        // Add event listeners to filter buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active button
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Apply filter
                const filter = btn.dataset.filter;
                applyScheduleFilter(filter);
            });
        });
    }
}

// Apply filter to schedule
function applyScheduleFilter(filter) {
    const slots = document.querySelectorAll('.course-slot');
    
    slots.forEach(slot => {
        if (filter === 'all') {
            slot.style.display = '';
        } else {
            if (slot.classList.contains(filter.toLowerCase())) {
                slot.style.display = '';
            } else {
                slot.style.display = 'none';
            }
        }
    });
}

// Show course details modal when clicking on a course slot
function setupCourseDetailClicks() {
    document.addEventListener('click', function(e) {
        // Find closest course slot parent
        const courseSlot = e.target.closest('.course-slot');
        if (courseSlot) {
            showCourseDetailModal(courseSlot);
        }
    });
}

// Show course detail modal with seat availability
function showCourseDetailModal(courseSlot) {
    // Extract course details
    const courseTitle = courseSlot.querySelector('h3')?.textContent || 'Unknown Course';
    const courseId = courseSlot.querySelector('.course-id')?.textContent || '';
    const courseType = courseSlot.querySelector('.course-type-badge')?.textContent || '';
    const courseTime = courseSlot.querySelector('.course-time')?.textContent || '';
    const courseLocation = courseSlot.querySelector('.course-location')?.textContent || '';
    const courseInstructor = courseSlot.querySelector('.course-instructor')?.textContent || '';
    const slotId = courseSlot.dataset.slotId || '';
    
    // Determine modal class based on course type
    let modalClass = 'modal-default';
    if (courseSlot.classList.contains('lecture')) modalClass = 'modal-lecture';
    if (courseSlot.classList.contains('lab')) modalClass = 'modal-lab';
    if (courseSlot.classList.contains('tutorial')) modalClass = 'modal-tutorial';
    
    // Create modal HTML with improved room information display
    const modalHtml = `
        <div class="course-modal ${modalClass}">
            <div class="modal-header">
                <h2>${courseTitle}</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="modal-info-group">
                    <div class="modal-label">Course Code:</div>
                    <div class="modal-value">${courseId}</div>
                </div>
                <div class="modal-info-group">
                    <div class="modal-label">Type:</div>
                    <div class="modal-value">${courseType}</div>
                </div>
                <div class="modal-info-group">
                    <div class="modal-label">Time:</div>
                    <div class="modal-value">${courseTime}</div>
                </div>
                <div class="modal-info-group">
                    <div class="modal-label">Location:</div>
                    <div class="modal-value"><strong>${courseLocation.replace('<i class="bi bi-building"></i> ', '')}</strong></div>
                </div>
                <div class="modal-info-group">
                    <div class="modal-label">Instructor:</div>
                    <div class="modal-value">${courseInstructor.replace('<i class="bi bi-person"></i> ', '')}</div>
                </div>
                <div class="modal-info-group" id="seats-info">
                    <div class="modal-label">Availability:</div>
                    <div class="modal-value">
                        <div class="loading-spinner-small"></div> Loading seat information...
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn btn-primary open-registration">Edit Time Slots</button>
            </div>
        </div>
    `;
    
    // Create modal container
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal-container';
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);
    
    // Fade in effect
    setTimeout(() => {
        modalContainer.classList.add('active');
    }, 10);
    
    // Setup close button
    const closeBtn = modalContainer.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal(modalContainer);
        });
    }
    
    // Setup outside click to close
    modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
            closeModal(modalContainer);
        }
    });
    
    // Setup registration button
    const registrationBtn = modalContainer.querySelector('.open-registration');
    if (registrationBtn) {
        registrationBtn.addEventListener('click', () => {
            window.location.href = 'StudentRegistration.html';
        });
    }
    
    // Fetch seat availability if we have a valid course ID
    if (courseId && courseId.trim() !== '') {
        fetchSeatAvailability(courseId.trim(), slotId)
            .then(seatInfo => {
                // Update the seat information in the modal
                const seatsInfoValue = modalContainer.querySelector('#seats-info .modal-value');
                if (seatsInfoValue) {
                    if (seatInfo) {
                        // Format the seat information with appropriate styling
                        let statusClass = '';
                        let icon = '';
                        
                        if (seatInfo.seats_available <= 0) {
                            statusClass = 'seats-full';
                            icon = '<i class="bi bi-x-circle-fill"></i>';
                        } else if (seatInfo.seats_available < 5) {
                            statusClass = 'seats-limited';
                            icon = '<i class="bi bi-exclamation-triangle-fill"></i>';
                        } else {
                            statusClass = 'seats-available';
                            icon = '<i class="bi bi-check-circle-fill"></i>';
                        }
                        
                        const percentFull = Math.round((seatInfo.enrolled_count / seatInfo.room_capacity) * 100);
                        
                        seatsInfoValue.innerHTML = `
                            <div class="seats-info ${statusClass}">
                                ${icon} ${seatInfo.seats_available} seats available out of ${seatInfo.room_capacity} total
                            </div>
                            <div class="seat-capacity-bar">
                                <div class="seat-capacity-fill" style="width: ${percentFull}%"></div>
                            </div>
                            <div class="seat-capacity-text">
                                ${seatInfo.enrolled_count} students enrolled (${percentFull}% full)
                            </div>
                        `;
                    } else {
                        seatsInfoValue.textContent = 'No seat information available';
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching seat availability:', error);
                const seatsInfoValue = modalContainer.querySelector('#seats-info .modal-value');
                if (seatsInfoValue) {
                    seatsInfoValue.innerHTML = '<span class="error-text">Could not load seat information</span>';
                }
            });
    }
}

// Fetch seat availability for a course and specific slot
async function fetchSeatAvailability(courseId, slotId) {
    try {
        const token = getToken();
        if (!token) {
            console.error('No token found for seat availability request');
            return null;
        }
        
        // Fetch seat information from the API
        const response = await fetch(`${baseUrl}/schedule/time-slots-with-seats/${courseId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.warn(`Error fetching seat availability: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        // Find the specific slot we're interested in
        if (slotId) {
            // Look for the slot in all slot types (lecture, lab, tutorial)
            for (const slotType of ['lecture', 'lab', 'tutorial']) {
                if (data[slotType]) {
                    const slot = data[slotType].find(s => s.slot_id === slotId);
                    if (slot) {
                        return {
                            seats_available: slot.seats_available,
                            room_capacity: slot.room_capacity,
                            enrolled_count: slot.enrolled_count
                        };
                    }
                }
            }
        }
        
        // If we couldn't find specific slot info, return null
        console.warn('Could not find specific slot info in the response');
        return null;
    } catch (error) {
        console.error('Error in fetchSeatAvailability:', error);
        return null;
    }
}

// Close modal with fade out effect
function closeModal(modalContainer) {
    modalContainer.classList.remove('active');
    setTimeout(() => {
        document.body.removeChild(modalContainer);
    }, 300);
}

// Add custom styles for schedule slots
function addScheduleStyles() {
    // Create style element if it doesn't exist
    if (!document.getElementById('schedule-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'schedule-custom-styles';
        
        // Define improved styles for schedule slots
        style.textContent = `
            .course-slot {
                padding: 8px;
                border-radius: 6px;
                transition: all 0.2s;
                height: 100%;
                overflow: hidden;
            }
            
            .course-slot:hover {
                transform: scale(1.02);
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                z-index: 10;
                overflow: visible;
            }
            
            .course-details {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            
            .course-details h3 {
                margin: 0 0 5px 0;
                font-size: 14px;
                font-weight: 600;
                color: #333;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .course-slot:hover .course-details h3 {
                white-space: normal;
            }
            
            .course-id {
                font-size: 12px;
                font-weight: 600;
                color: #555;
                margin-bottom: 3px;
            }
            
            .course-time {
                font-size: 12px;
                color: #666;
                margin-bottom: 5px;
            }
            
            .course-location, .course-instructor {
                font-size: 11px;
                color: #777;
                margin-bottom: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .course-slot:hover .course-location,
            .course-slot:hover .course-instructor {
                white-space: normal;
            }
            
            .course-type-badge {
                position: absolute;
                top: 5px;
                right: 5px;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                background-color: rgba(0,0,0,0.1);
                color: #333;
            }
            
            /* Slot types */
            .lecture {
                background-color: #e3f2fd;
                border-left: 4px solid #2196f3;
            }
            
            .lab {
                background-color: #f1f8e9;
                border-left: 4px solid #8bc34a;
            }
            
            .tutorial {
                background-color: #fff3e0;
                border-left: 4px solid #ff9800;
            }
            
            /* Modal styles */
            .course-modal {
                background-color: white;
                padding: 25px;
                border-radius: 8px;
                box-shadow: 0 5px 25px rgba(0,0,0,0.15);
                max-width: 500px;
                width: 90%;
            }
            
            .modal-header h2 {
                margin-top: 0;
                color: #333;
                font-size: 20px;
            }
            
            .modal-info-group {
                display: flex;
                margin-bottom: 10px;
            }
            
            .modal-label {
                font-weight: 500;
                width: 120px;
                color: #555;
            }
            
            .modal-value {
                flex: 1;
                color: #333;
            }
            
            /* Seat availability styles */
            .seats-info {
                display: flex;
                align-items: center;
                padding: 6px 10px;
                border-radius: 4px;
                margin-bottom: 8px;
                font-weight: 500;
            }
            
            .seats-info i {
                margin-right: 5px;
            }
            
            .seats-available {
                background-color: #e3fcef;
                color: #0d6832;
            }
            
            .seats-limited {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .seats-full {
                background-color: #f8d7da;
                color: #721c24;
            }
            
            .seat-capacity-bar {
                height: 8px;
                background-color: #e9ecef;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 5px;
            }
            
            .seat-capacity-fill {
                height: 100%;
                background-color: #4caf50;
                border-radius: 4px;
            }
            
            .seat-capacity-fill[style*="width: 8"] {
                background-color: #ff9800;
            }
            
            .seat-capacity-fill[style*="width: 9"] {
                background-color: #ff5722;
            }
            
            .seat-capacity-fill[style*="width: 100%"] {
                background-color: #f44336;
            }
            
            .seat-capacity-text {
                font-size: 12px;
                color: #6c757d;
            }
            
            .loading-spinner-small {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid rgba(0, 0, 0, 0.1);
                border-radius: 50%;
                border-top-color: #007bff;
                animation: spin 1s linear infinite;
                margin-right: 8px;
                vertical-align: middle;
            }
            
            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }
            
            .error-text {
                color: #dc3545;
            }
        `;
        
        document.head.appendChild(style);
    }
} 