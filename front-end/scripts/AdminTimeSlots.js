const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

// Function to get token from local storage
async function getAuthHeaders() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../html/Login.html';
        return {};
    }
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

// Function to handle API errors
async function handleApiError(error) {
    console.error('API Error:', error);
    if (error.response) {
        const data = await error.response.json();
        throw new Error(data.detail || 'An error occurred while saving the time slot');
    } else if (error.request) {
        throw new Error('No response received from server. Please check if the server is running.');
    } else {
        throw new Error('Error setting up the request: ' + error.message);
    }
}

// Check if user is logged in and is an admin
function checkAuth() {
    const token = localStorage.getItem('token');
    const userRole = localStorage.getItem('userRole');
    
    if (!token || userRole !== 'admin') {
        window.location.href = '../html/Login.html';
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

// Initialize page
document.addEventListener("DOMContentLoaded", function() {
    // Check authentication first
    if (!checkAuth()) {
        return;
    }

    // Load data when document is ready
    Promise.all([
        loadRooms(),
        loadInstructors(),
        loadCourses(),
        loadTimeSlots()
    ]).catch(error => {
        console.error("Error initializing page:", error);
        if (typeof showError === 'function') {
            showError("Error loading page data. Please try refreshing the page.");
        } else {
            alert("Error loading page data. Please try refreshing the page.");
        }
    });
    
    // Setup logout button event listener
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
        });
    }

    // Setup time calculation for duration field
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const durationInput = document.getElementById('duration');
    
    if (startTimeInput && endTimeInput && durationInput) {
        const calculateDuration = () => {
            const startTime = startTimeInput.value;
            const endTime = endTimeInput.value;
            
            if (startTime && endTime) {
                const start = new Date(`2000-01-01T${startTime}`);
                const end = new Date(`2000-01-01T${endTime}`);
                
                if (end > start) {
                    const diffMs = end - start;
                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffMins = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    
                    durationInput.value = `${diffHrs} hr ${diffMins} min`;
                } else {
                    durationInput.value = 'End time must be after start time';
                }
            } else {
                durationInput.value = '';
            }
        };
        
        startTimeInput.addEventListener('change', calculateDuration);
        endTimeInput.addEventListener('change', calculateDuration);
    }

    // Setup view switcher
    const tableViewBtn = document.getElementById('tableViewBtn');
    const calendarViewBtn = document.getElementById('calendarViewBtn');
    const tableView = document.getElementById('tableView');
    const calendarView = document.getElementById('calendarView');
    
    if (tableViewBtn && calendarViewBtn && tableView && calendarView) {
        tableViewBtn.addEventListener('click', function() {
            tableView.style.display = 'block';
            calendarView.style.display = 'none';
            tableViewBtn.classList.add('active');
            calendarViewBtn.classList.remove('active');
        });
        
        calendarViewBtn.addEventListener('click', function() {
            tableView.style.display = 'none';
            calendarView.style.display = 'block';
            tableViewBtn.classList.remove('active');
            calendarViewBtn.classList.add('active');
            renderCalendarView();
        });
    }

    // Setup bulk add button
    const bulkAddBtn = document.getElementById('bulkAddBtn');
    if (bulkAddBtn) {
        bulkAddBtn.addEventListener('click', function() {
            const bulkAddModal = new bootstrap.Modal(document.getElementById('bulkAddModal'));
            setupTimeGrid();
            bulkAddModal.show();
        });
    }

    // Setup clear filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            document.getElementById('filterDay').value = '';
            document.getElementById('filterType').value = '';
            document.getElementById('filterCourse').value = '';
            applyFilters();
        });
    }

    // Setup filters
    const filterInputs = ['filterDay', 'filterType', 'filterCourse'];
    filterInputs.forEach(id => {
        const filterElement = document.getElementById(id);
        if (filterElement) {
            filterElement.addEventListener('change', applyFilters);
        }
    });

    // Load filter options for courses
    loadFilterOptions();
});

// Load Rooms for Dropdown
async function loadRooms(targetSelect) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/rooms/`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const rooms = await response.json();
        const roomSelect = targetSelect || document.getElementById("roomId");
        roomSelect.innerHTML = '<option value="">Select Room</option>';

        rooms.forEach(room => {
            const option = document.createElement("option");
            option.value = room.room_id;
            option.textContent = `${room.building} - ${room.room_id}`;
            roomSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading rooms:", error);
        if (typeof showError === 'function') {
            showError("Failed to load rooms. Please try refreshing the page.");
        }
    }
}

// Load Instructors for Dropdown
async function loadInstructors(targetSelect) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/users/`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const users = await response.json();
        const instructors = users.filter(user => user.role === "instructor");
        
        const instructorSelect = targetSelect || document.getElementById("instructor");
        instructorSelect.innerHTML = '<option value="">Select Instructor</option>';

        instructors.forEach(instructor => {
            const option = document.createElement("option");
            option.value = instructor.instructor_id;
            option.textContent = instructor.name;
            instructorSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading instructors:", error);
    }
}

// Load Courses for Dropdown
async function loadCourses(targetSelect) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/courses/`, {
            headers: headers
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const courses = await response.json();
        const courseSelect = targetSelect || document.getElementById("courseId");
        courseSelect.innerHTML = '<option value="">Select Course</option>';

        courses.forEach(course => {
            const option = document.createElement("option");
            option.value = course.course_id;
            option.textContent = `${course.course_id} - ${course.name}`;
            courseSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading courses:", error);
    }
}

// Load Time Slots into Table
async function loadTimeSlots() {
    try {
        const headers = await getAuthHeaders();
        console.log('Fetching time slots with headers:', headers);
        
        const response = await fetch(`${API_BASE_URL}/time-slots/`, {
            headers: headers
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server response:', response.status, errorData);
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`);
        }

        const timeSlots = await response.json();
        console.log('Received time slots:', timeSlots);
        
        const tableBody = document.getElementById("timeSlotTableBody");
        if (!tableBody) {
            console.error('Could not find timeSlotTableBody element');
            throw new Error('Table body element not found');
        }
        
        tableBody.innerHTML = "";

        if (!Array.isArray(timeSlots)) {
            console.error('Received non-array time slots:', timeSlots);
            throw new Error('Invalid time slots data received from server');
        }

        timeSlots.forEach(slot => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${slot.room_id || 'N/A'}</td>
                <td>${slot.type || 'N/A'}</td>
                <td>${slot.start_time || 'N/A'}</td>
                <td>${slot.end_time || 'N/A'}</td>
                <td>${slot.day || 'N/A'}</td>
                <td>${slot.instructor_id || 'Not Assigned'}</td>
                <td>${slot.course_id || 'Not Assigned'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editTimeSlot('${slot.slot_id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTimeSlot('${slot.slot_id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading time slots:", error);
        if (typeof showError === 'function') {
            showError(`Failed to load time slots: ${error.message}`);
        } else {
            alert(`Failed to load time slots: ${error.message}`);
        }
    }
}

// Format time to HH:MM:SS
function formatTime(timeValue) {
    if (!timeValue) return null;
    // If time is already in HH:MM:SS format, return as is
    if (timeValue.match(/^\d{2}:\d{2}:\d{2}$/)) return timeValue;
    // If time is in HH:MM format, add seconds
    if (timeValue.match(/^\d{2}:\d{2}$/)) return `${timeValue}:00`;
    // If time is in HH format, add minutes and seconds
    if (timeValue.match(/^\d{2}$/)) return `${timeValue}:00:00`;
    return timeValue;
}

// Validate time slot data
function validateTimeSlot(formData) {
    if (!formData.room_id) {
        throw new Error('Please select a room');
    }
    if (!formData.day) {
        throw new Error('Please select a day');
    }
    if (!formData.start_time) {
        throw new Error('Please enter a start time');
    }
    if (!formData.end_time) {
        throw new Error('Please enter an end time');
    }
    if (!formData.type) {
        throw new Error('Please select a type');
    }
    if (!formData.course_id) {
        throw new Error('Please select a course - this is required for students to find the time slot');
    }

    // Validate time format - accept both HH:MM and HH:MM:SS formats
    let startTime = formData.start_time;
    let endTime = formData.end_time;
    
    // Add seconds if they're missing
    if (startTime.match(/^\d{2}:\d{2}$/)) {
        startTime = `${startTime}:00`;
        formData.start_time = startTime;
    }
    
    if (endTime.match(/^\d{2}:\d{2}$/)) {
        endTime = `${endTime}:00`;
        formData.end_time = endTime;
    }
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (!timeRegex.test(startTime)) {
        throw new Error('Invalid start time format. Please use HH:MM or HH:MM:SS format');
    }
    
    if (!timeRegex.test(endTime)) {
        throw new Error('Invalid end time format. Please use HH:MM or HH:MM:SS format');
    }

    // Validate that end time is after start time
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    if (end <= start) {
        throw new Error('End time must be after start time');
    }
    
    // Validate minimum duration (15 minutes)
    const durationMs = end - start;
    const durationMinutes = durationMs / (1000 * 60);
    
    if (durationMinutes < 15) {
        throw new Error('Time slot must be at least 15 minutes long');
    }
}

// Handle Form Submission for Adding/Editing Time Slots
async function saveTimeSlot(event) {
    event.preventDefault();
    
    try {
        const form = document.getElementById("timeSlotForm");
        const isEdit = form.dataset.mode === "edit";
        const slotId = form.dataset.slotId;

        const formData = {
            room_id: document.getElementById('roomId').value,
            day: document.getElementById('day').value,
            start_time: formatTime(document.getElementById('startTime').value),
            end_time: formatTime(document.getElementById('endTime').value),
            type: document.getElementById('type').value,
            instructor_id: document.getElementById('instructor').value || null,
            course_id: document.getElementById('courseId').value || null
        };

        // Validate the form data
        validateTimeSlot(formData);

        // Show loading indicator
        let loadingAlert = typeof showLoading === 'function' ? 
            showLoading(`${isEdit ? 'Updating' : 'Saving'} time slot...`) : null;

        const headers = await getAuthHeaders();
        const url = isEdit ? 
            `${API_BASE_URL}/time-slots/${slotId}` : 
            `${API_BASE_URL}/time-slots/`;
        
        const response = await fetch(url, {
            method: isEdit ? 'PUT' : 'POST',
            headers: headers,
            body: JSON.stringify(formData)
        });

        // Close loading indicator
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Failed to ${isEdit ? 'update' : 'save'} time slot`);
        }

        const result = await response.json();
        
        // Show success message
        if (typeof showSuccess === 'function') {
            showSuccess(`Time slot ${isEdit ? 'updated' : 'saved'} successfully!`);
        } else {
            alert(`Time slot ${isEdit ? 'updated' : 'saved'} successfully!`);
        }
        
        loadTimeSlots(); // Refresh the list
        closeModal(); // Close the modal after successful save
        
    } catch (error) {
        console.error('Error saving time slot:', error);
        if (typeof showError === 'function') {
            showError(error.message || 'An error occurred while saving the time slot');
        } else {
            alert(error.message || 'An error occurred while saving the time slot');
        }
    }
}

// Edit Time Slot
async function editTimeSlot(slotId) {
    try {
        // Show loading indicator
        let loadingAlert = typeof showLoading === 'function' ?
            showLoading('Loading time slot details...') : null;

        console.log('Fetching time slot details for ID:', slotId);
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/time-slots/${slotId}`, {
            headers: headers
        });

        // Close loading indicator
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server response:', response.status, errorData);
            throw new Error(errorData.detail || `Failed to fetch time slot: ${response.status}`);
        }

        const slot = await response.json();
        console.log('Received time slot data:', slot);

        // Get form elements
        const roomSelect = document.getElementById("roomId");
        const daySelect = document.getElementById("day");
        const startTimeInput = document.getElementById("startTime");
        const endTimeInput = document.getElementById("endTime");
        const typeSelect = document.getElementById("type");
        const instructorSelect = document.getElementById("instructor");
        const courseSelect = document.getElementById("courseId");

        if (!roomSelect || !daySelect || !startTimeInput || !endTimeInput || !typeSelect || !instructorSelect || !courseSelect) {
            throw new Error('One or more form elements not found');
        }

        // Set form values
        roomSelect.value = slot.room_id || '';
        daySelect.value = slot.day || '';
        startTimeInput.value = slot.start_time || '';
        endTimeInput.value = slot.end_time || '';
        typeSelect.value = slot.type || '';
        instructorSelect.value = slot.instructor_id || '';
        courseSelect.value = slot.course_id || '';

        // Set form mode and slot ID
        const form = document.getElementById("timeSlotForm");
        if (!form) {
            throw new Error('Time slot form not found');
        }
        form.dataset.mode = "edit";
        form.dataset.slotId = slotId;

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById("timeSlotModal"));
        modal.show();
    } catch (error) {
        console.error("Error editing time slot:", error);
        if (typeof showError === 'function') {
            showError(`Failed to load time slot details: ${error.message}`);
        } else {
            alert(`Failed to load time slot details: ${error.message}`);
        }
    }
}

// Delete Time Slot
async function deleteTimeSlot(slotId) {
    try {
        // Fallback to native confirmation if SweetAlert is having issues
        let confirmed;
        
        try {
            // Try to use SweetAlert2 confirmation
            if (typeof showConfirmation === 'function') {
                confirmed = await showConfirmation("Are you sure you want to delete this time slot?");
            } else {
                confirmed = confirm("Are you sure you want to delete this time slot?");
            }
        } catch (confirmError) {
            // Fallback to native confirm if SweetAlert2 errors out
            console.error("Error with SweetAlert confirmation:", confirmError);
            confirmed = confirm("Are you sure you want to delete this time slot?");
        }
        
        if (!confirmed) return;

        // Show loading indicator (try/catch in case it fails)
        let loadingAlert = null;
        try {
            if (typeof showLoading === 'function') {
                loadingAlert = showLoading('Deleting time slot...');
            }
        } catch (loadingError) {
            console.error("Error showing loading indicator:", loadingError);
        }

        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/time-slots/${slotId}`, {
            method: "DELETE",
            headers: headers
        });

        // Close loading indicator (try/catch in case it fails)
        try {
            if (typeof closeLoading === 'function' && loadingAlert) {
                closeLoading(loadingAlert);
            }
        } catch (closeError) {
            console.error("Error closing loading indicator:", closeError);
        }

        if (!response.ok) throw new Error("Failed to delete time slot");

        loadTimeSlots();
        
        // Show success message (try/catch in case it fails)
        try {
            if (typeof showSuccess === 'function') {
                showSuccess("Time slot deleted successfully!");
            } else {
                alert("Time slot deleted successfully!");
            }
        } catch (successError) {
            console.error("Error showing success message:", successError);
            alert("Time slot deleted successfully!");
        }
    } catch (error) {
        console.error("Error deleting time slot:", error);
        // Show error message (try/catch in case it fails)
        try {
            if (typeof showError === 'function') {
                showError("Failed to delete time slot. Please try again.");
            } else {
                alert("Failed to delete time slot. Please try again.");
            }
        } catch (errorMsgError) {
            console.error("Error showing error message:", errorMsgError);
            alert("Failed to delete time slot. Please try again.");
        }
    }
}

// Close modal function
function closeModal() {
    const modal = bootstrap.Modal.getInstance(document.getElementById("timeSlotModal"));
    if (modal) {
        modal.hide();
    }
    const form = document.getElementById("timeSlotForm");
    form.reset();
    form.dataset.mode = "add";
    form.dataset.slotId = "";
}

// Filter time slots based on selected filters
function applyFilters() {
    const dayFilter = document.getElementById('filterDay').value;
    const typeFilter = document.getElementById('filterType').value;
    const courseFilter = document.getElementById('filterCourse').value;
    
    const rows = document.querySelectorAll('#timeSlotTableBody tr');
    
    rows.forEach(row => {
        const day = row.cells[4].textContent;
        const type = row.cells[1].textContent;
        const course = row.cells[6].textContent;
        
        const dayMatch = !dayFilter || day === dayFilter;
        const typeMatch = !typeFilter || type === typeFilter;
        const courseMatch = !courseFilter || course.includes(courseFilter);
        
        if (dayMatch && typeMatch && courseMatch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Load filter options for courses
async function loadFilterOptions() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/courses/`, {
            headers: headers
        });
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const courses = await response.json();
        const courseSelect = document.getElementById('filterCourse');
        
        if (courseSelect) {
            courseSelect.innerHTML = '<option value="">All Courses</option>';
            
            courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course.course_id;
                option.textContent = `${course.course_id} - ${course.name}`;
                courseSelect.appendChild(option);
            });
        }
        
        // Also populate the calendar filter
        const calendarRoomFilter = document.getElementById('calendarFilterRoom');
        if (calendarRoomFilter) {
            loadRoomsForFilter(calendarRoomFilter);
        }
    } catch (error) {
        console.error('Error loading filter options:', error);
    }
}

// Load rooms for filter
async function loadRoomsForFilter(selectElement) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/rooms/`, {
            headers: headers
        });
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const rooms = await response.json();
        
        selectElement.innerHTML = '<option value="">All Rooms</option>';
        
        rooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room.room_id;
            option.textContent = `${room.building} - ${room.room_id}`;
            selectElement.appendChild(option);
        });
        
        // Add event listener for filtering
        selectElement.addEventListener('change', function() {
            renderCalendarView();
        });
    } catch (error) {
        console.error('Error loading rooms for filter:', error);
    }
}

// Setup time grid for bulk adding time slots
function setupTimeGrid() {
    const timeGrid = document.getElementById('timeGrid');
    if (!timeGrid) return;
    
    timeGrid.innerHTML = '';
    
    // Add days header row
    const daysRow = document.createElement('div');
    daysRow.style.display = 'contents';
    
    // Add empty cell for top-left corner
    const cornerCell = document.createElement('div');
    cornerCell.className = 'time-grid-header';
    cornerCell.textContent = 'Time / Day';
    daysRow.appendChild(cornerCell);
    
    // Add day headers
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    days.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'time-grid-header';
        dayHeader.textContent = day;
        daysRow.appendChild(dayHeader);
    });
    
    timeGrid.appendChild(daysRow);
    
    // Add time rows (8:00 AM to 10:00 PM)
    const startHour = 8;
    const endHour = 22;
    
    for (let hour = startHour; hour < endHour; hour++) {
        const hourRow = document.createElement('div');
        hourRow.style.display = 'contents';
        
        // Add time label
        const timeLabel = document.createElement('div');
        timeLabel.className = 'time-label';
        timeLabel.textContent = `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
        hourRow.appendChild(timeLabel);
        
        // Add cells for each day
        days.forEach(day => {
            const timeCell = document.createElement('div');
            timeCell.className = 'time-cell';
            timeCell.dataset.day = day;
            timeCell.dataset.hour = hour;
            
            // Add click handler for selection
            timeCell.addEventListener('click', function() {
                toggleTimeSlotSelection(timeCell);
            });
            
            hourRow.appendChild(timeCell);
        });
        
        timeGrid.appendChild(hourRow);
    }
    
    // Load existing time slots to mark as occupied
    loadExistingTimeSlotsForGrid();
    
    // Setup bulk form dropdowns
    loadRooms(document.getElementById('bulkRoomId'));
    loadInstructors(document.getElementById('bulkInstructor'));
    loadCourses(document.getElementById('bulkCourseId'));
}

// Load existing time slots to mark occupied slots in the grid
async function loadExistingTimeSlotsForGrid() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/time-slots/`, {
            headers: headers
        });
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const timeSlots = await response.json();
        const roomId = document.getElementById('bulkRoomId').value;
        
        // If a room is selected, mark its occupied slots
        if (roomId) {
            const roomSlots = timeSlots.filter(slot => slot.room_id === roomId);
            
            roomSlots.forEach(slot => {
                const day = slot.day;
                const startHour = parseInt(slot.start_time.split(':')[0]);
                const endHour = parseInt(slot.end_time.split(':')[0]);
                
                // Mark all hours in this time range as occupied
                for (let hour = startHour; hour < endHour; hour++) {
                    const cell = document.querySelector(`.time-cell[data-day="${day}"][data-hour="${hour}"]`);
                    if (cell) {
                        cell.classList.add('occupied');
                        cell.title = `${slot.course_id || 'Unknown course'} - ${slot.start_time} to ${slot.end_time}`;
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading existing time slots for grid:', error);
    }
}

// Toggle time slot selection in the grid
function toggleTimeSlotSelection(cell) {
    // Don't allow selecting occupied slots
    if (cell.classList.contains('occupied')) return;
    
    const isSelected = cell.classList.toggle('selected');
    const day = cell.dataset.day;
    const hour = parseInt(cell.dataset.hour);
    
    updateSelectedSlotsList();
}

// Update the selected slots display
function updateSelectedSlotsList() {
    const selectedSlots = document.getElementById('selectedSlots');
    if (!selectedSlots) return;
    
    selectedSlots.innerHTML = '';
    
    // Get all selected cells and group them by day
    const selectedCells = document.querySelectorAll('.time-cell.selected');
    const slotsByDay = {};
    
    selectedCells.forEach(cell => {
        const day = cell.dataset.day;
        const hour = parseInt(cell.dataset.hour);
        
        if (!slotsByDay[day]) {
            slotsByDay[day] = [];
        }
        
        slotsByDay[day].push(hour);
    });
    
    // Sort hours and find consecutive ranges
    Object.keys(slotsByDay).forEach(day => {
        const hours = slotsByDay[day].sort((a, b) => a - b);
        const ranges = [];
        
        let rangeStart = hours[0];
        let prevHour = hours[0];
        
        for (let i = 1; i < hours.length; i++) {
            if (hours[i] !== prevHour + 1) {
                ranges.push([rangeStart, prevHour]);
                rangeStart = hours[i];
            }
            prevHour = hours[i];
        }
        
        ranges.push([rangeStart, prevHour]);
        
        // Create display items for each range
        ranges.forEach(range => {
            const [startHour, endHour] = range;
            const startTime = `${startHour % 12 || 12}:00 ${startHour < 12 ? 'AM' : 'PM'}`;
            const endTime = `${(endHour + 1) % 12 || 12}:00 ${(endHour + 1) < 12 ? 'AM' : 'PM'}`;
            
            const slotItem = document.createElement('div');
            slotItem.className = 'selected-slot-item';
            
            slotItem.innerHTML = `
                <span>${day}, ${startTime} - ${endTime}</span>
                <button type="button" class="remove-slot" 
                    data-day="${day}" 
                    data-start="${startHour}" 
                    data-end="${endHour}">
                    <i class="bi bi-x-circle"></i>
                </button>
            `;
            
            selectedSlots.appendChild(slotItem);
        });
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-slot').forEach(button => {
        button.addEventListener('click', function() {
            const day = this.dataset.day;
            const startHour = parseInt(this.dataset.start);
            const endHour = parseInt(this.dataset.end);
            
            // Deselect all cells in this range
            for (let hour = startHour; hour <= endHour; hour++) {
                const cell = document.querySelector(`.time-cell[data-day="${day}"][data-hour="${hour}"]`);
                if (cell) {
                    cell.classList.remove('selected');
                }
            }
            
            updateSelectedSlotsList();
        });
    });
    
    // Show message if no slots selected
    if (selectedCells.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'text-muted small';
        emptyMessage.textContent = 'No time slots selected yet. Click on the grid to select slots.';
        selectedSlots.appendChild(emptyMessage);
    }
}

// Save bulk time slots
async function saveBulkTimeSlots(event) {
    event.preventDefault();
    
    try {
        const selectedCells = document.querySelectorAll('.time-cell.selected');
        if (selectedCells.length === 0) {
            throw new Error('Please select at least one time slot');
        }
        
        const roomId = document.getElementById('bulkRoomId').value;
        const courseId = document.getElementById('bulkCourseId').value;
        const instructorId = document.getElementById('bulkInstructor').value || null;
        const type = document.getElementById('bulkType').value;
        
        if (!roomId) throw new Error('Please select a room');
        if (!courseId) throw new Error('Please select a course');
        if (!type) throw new Error('Please select a slot type');
        
        // Group selected cells by day and consecutive hours
        const slotsByDay = {};
        
        selectedCells.forEach(cell => {
            const day = cell.dataset.day;
            const hour = parseInt(cell.dataset.hour);
            
            if (!slotsByDay[day]) {
                slotsByDay[day] = [];
            }
            
            slotsByDay[day].push(hour);
        });
        
        // Create time slot objects for consecutive hours
        const timeSlots = [];
        
        Object.keys(slotsByDay).forEach(day => {
            const hours = slotsByDay[day].sort((a, b) => a - b);
            const ranges = [];
            
            let rangeStart = hours[0];
            let prevHour = hours[0];
            
            for (let i = 1; i < hours.length; i++) {
                if (hours[i] !== prevHour + 1) {
                    ranges.push([rangeStart, prevHour + 1]);
                    rangeStart = hours[i];
                }
                prevHour = hours[i];
            }
            
            ranges.push([rangeStart, prevHour + 1]);
            
            // Create time slot objects
            ranges.forEach(range => {
                const [startHour, endHour] = range;
                
                // Format times as HH:MM:SS
                const formatHour = (h) => h.toString().padStart(2, '0');
                const startTime = `${formatHour(startHour)}:00:00`;
                const endTime = `${formatHour(endHour)}:00:00`;
                
                timeSlots.push({
                    room_id: roomId,
                    day: day,
                    start_time: startTime,
                    end_time: endTime,
                    type: type,
                    instructor_id: instructorId,
                    course_id: courseId
                });
            });
        });
        
        // Show loading indicator
        let loadingAlert = typeof showLoading === 'function' ? 
            showLoading(`Saving ${timeSlots.length} time slots...`) : null;
        
        // Save each time slot
        const headers = await getAuthHeaders();
        const promises = timeSlots.map(slot => 
            fetch(`${API_BASE_URL}/time-slots/`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(slot)
            })
        );
        
        const results = await Promise.allSettled(promises);
        
        // Close loading
        if (typeof closeLoading === 'function') {
            closeLoading(loadingAlert);
        }
        
        // Check results
        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        if (failed > 0) {
            if (typeof showWarning === 'function') {
                showWarning(`Created ${succeeded} time slots, but ${failed} failed.`);
            } else {
                alert(`Created ${succeeded} time slots, but ${failed} failed.`);
            }
        } else {
            if (typeof showSuccess === 'function') {
                showSuccess(`Successfully created ${succeeded} time slots!`);
            } else {
                alert(`Successfully created ${succeeded} time slots!`);
            }
        }
        
        // Close modal and refresh
        const modal = bootstrap.Modal.getInstance(document.getElementById('bulkAddModal'));
        if (modal) {
            modal.hide();
        }
        
        loadTimeSlots();
        
    } catch (error) {
        console.error('Error saving bulk time slots:', error);
        if (typeof showError === 'function') {
            showError(error.message || 'An error occurred while saving time slots');
        } else {
            alert(error.message || 'An error occurred while saving time slots');
        }
    }
}

// Render calendar view of time slots
async function renderCalendarView() {
    const calendarBody = document.getElementById('calendarBody');
    if (!calendarBody) return;
    
    try {
        calendarBody.innerHTML = '';
        
        // Get selected room filter
        const roomFilter = document.getElementById('calendarFilterRoom').value;
        
        // Create time rows (8:00 AM to 10:00 PM)
        const startHour = 8;
        const endHour = 22;
        
        // Define days
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        // Create grid cells
        for (let hour = startHour; hour < endHour; hour++) {
            // Create hour marker
            const hourMarker = document.createElement('div');
            hourMarker.className = 'hour-marker';
            hourMarker.textContent = `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
            calendarBody.appendChild(hourMarker);
            
            // Create cells for each day
            days.forEach(day => {
                const dayCell = document.createElement('div');
                dayCell.className = 'calendar-grid-cell';
                dayCell.dataset.day = day;
                dayCell.dataset.hour = hour;
                calendarBody.appendChild(dayCell);
            });
        }
        
        // Load time slots
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE_URL}/time-slots/`, {
            headers: headers
        });
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        
        const timeSlots = await response.json();
        
        // Filter by room if needed
        const filteredSlots = roomFilter ? 
            timeSlots.filter(slot => slot.room_id === roomFilter) : 
            timeSlots;
        
        // Add time blocks to calendar
        filteredSlots.forEach(slot => {
            const day = slot.day;
            const dayIndex = days.indexOf(day);
            
            if (dayIndex === -1) return;
            
            // Parse times
            const startTime = slot.start_time;
            const endTime = slot.end_time;
            
            const startHourStr = startTime.split(':')[0];
            const startHour = parseInt(startHourStr);
            
            const endHourStr = endTime.split(':')[0];
            const endHour = parseInt(endHourStr);
            
            const startMinuteStr = startTime.split(':')[1];
            const startMinute = parseInt(startMinuteStr);
            
            const endMinuteStr = endTime.split(':')[1];
            const endMinute = parseInt(endMinuteStr);
            
            // Calculate duration in minutes
            const startTotalMinutes = startHour * 60 + startMinute;
            const endTotalMinutes = endHour * 60 + endMinute;
            const durationMinutes = endTotalMinutes - startTotalMinutes;
            
            // Skip if start hour is before our grid
            if (startHour < startHour) return;
            
            // Create time block element
            const timeBlock = document.createElement('div');
            timeBlock.className = `time-block ${slot.type.toLowerCase()}`;
            
            // Calculate position
            const hourPosition = (startHour - startHour) * 40 + (startMinute / 60) * 40;
            const height = (durationMinutes / 60) * 40;
            
            // Set styles
            timeBlock.style.gridColumn = `${dayIndex + 2}`; // +2 because first column is time markers
            timeBlock.style.gridRow = `${startHour - startHour + 1}`; // +1 for 1-indexed grid
            timeBlock.style.top = `${hourPosition}px`;
            timeBlock.style.height = `${height}px`;
            
            // Set content
            timeBlock.innerHTML = `
                <div class="time-block-content">
                    <strong>${slot.course_id || 'No Course'}</strong><br>
                    ${slot.room_id || 'No Room'}<br>
                    ${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}
                </div>
            `;
            
            // Add edit function on click
            timeBlock.addEventListener('click', function() {
                editTimeSlot(slot.slot_id);
            });
            
            calendarBody.appendChild(timeBlock);
        });
        
    } catch (error) {
        console.error('Error rendering calendar view:', error);
    }
}
