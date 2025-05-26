// Original API base URL - commented for reference
// const API_BASE_URL = "http://127.0.0.1:8000/api/v1/rooms/"

// Make sure we're using the exact URL format expected by the FastAPI backend
const API_BASE_URL = "http://127.0.0.1:8000/api/v1/rooms/";

// Helper function to check if the backend server is available
async function checkServerAvailability() {
  try {
    console.log("Checking server availability at:", API_BASE_URL);
    
    // First try a simple OPTIONS request which is less likely to be blocked by CORS
    const pingResponse = await fetch(API_BASE_URL, { 
      method: 'OPTIONS',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      mode: 'cors',  // Explicitly set CORS mode
      // Add a timeout to avoid hanging if server is unreachable
      signal: AbortSignal.timeout(5000)
    });
    
    console.log("Server ping response status:", pingResponse.status);
    
    // For OPTIONS, a 204 No Content is common
    if (pingResponse.status === 204 || pingResponse.ok) {
      console.log("Server is reachable and responding to OPTIONS");
      return true;
    }
    
    // If OPTIONS doesn't work, try a simple GET without credentials
    console.log("OPTIONS request didn't return expected response, trying GET");
    const getResponse = await fetch(API_BASE_URL, { 
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      signal: AbortSignal.timeout(5000)
    });
    
    console.log("GET response status:", getResponse.status);
    
    if (!getResponse.ok) {
      if (getResponse.status === 401 || getResponse.status === 403) {
        console.log("Server is reachable but returns auth error, which is expected");
        return true; // Server is reachable, just unauthorized which is fine
      }
      
      console.error("Backend server responded with error:", getResponse.status);
      throw new Error(`Backend server responded with status ${getResponse.status}. Please check if the API is configured correctly.`);
    }
    
    return true;
  } catch (error) {
    console.error("Failed to connect to backend server:", error);
    
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      console.error("Network error - server likely not running");
      throw new Error("Cannot connect to server. Please check if the backend server is running at http://127.0.0.1:8000");
    } else if (error.name === 'AbortError') {
      console.error("Request timed out");
      throw new Error("Request timed out. Server might be unavailable or slow to respond.");
    } else {
      console.error("Other error type:", error.name);
      throw error; // Rethrow other errors
    }
  }
}

//Function to get token from the local storage
async function getAuthHeaders() {
  const token = localStorage.getItem("token");
  if (!token) {
    // Redirect to login if token is missing
    window.location.href = "../html/Login.html";
    return {};
  }

  // Check if token is expired
  if (isTokenExpired(token)) {
    console.log("Token has expired, attempting to refresh...");
    // Attempt to refresh token - if refresh fails, user will be redirected to login
    await refreshToken();
    
    // Get the refreshed token
    const refreshedToken = localStorage.getItem("token");
    if (!refreshedToken) {
      window.location.href = "../html/Login.html";
      return {};
    }
    
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${refreshedToken}`
    };
  }
  
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

// Function to check if token is expired
function isTokenExpired(token) {
  try {
    // Split the token and get the payload part
    const payload = token.split('.')[1];
    // Decode the base64 payload
    const decodedPayload = atob(payload);
    // Parse the JSON data
    const payloadData = JSON.parse(decodedPayload);
    // Get current time in seconds
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Check if the token is expired
    return payloadData.exp && payloadData.exp < currentTime;
  } catch (error) {
    console.error("Error checking token expiration:", error);
    // If there's an error parsing the token, assume it's invalid
    return true;
  }
}

// Function to refresh the token
async function refreshToken() {
  try {
    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      console.error("No refresh token available");
      // Redirect to login if refresh token is missing
      window.location.href = "../html/Login.html";
      return;
    }
    
    const response = await fetch("http://127.0.0.1:8000/api/v1/auth/token/refresh/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh: refreshToken })
    });
    
    if (!response.ok) {
      console.error("Token refresh failed");
      // If refresh fails, redirect to login
      window.location.href = "../html/Login.html";
      return;
    }
    
    const data = await response.json();
    console.log("Token refreshed successfully");
    
    // Store the new tokens
    localStorage.setItem("token", data.access);
    if (data.refresh) {
      localStorage.setItem("refreshToken", data.refresh);
    }
  } catch (error) {
    console.error("Error refreshing token:", error);
    // Redirect to login on any error
    window.location.href = "../html/Login.html";
  }
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

// Load rooms when the document is ready
document.addEventListener("DOMContentLoaded", () => {
  loadRooms();
  
  // Setup logout button event listener
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }
})

// Fetch all rooms
async function loadRooms() {
  try {
    // Show loading indicator in the table body
    const tableBody = document.getElementById("roomTableBody");
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading rooms...</td></tr>';
    
    console.log("Fetching rooms from:", API_BASE_URL);
    
    // Check if the backend server is reachable with a 3 second timeout
    try {
      await Promise.race([
        checkServerAvailability(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Server check timed out")), 3000)
        )
      ]);
    } catch (serverError) {
      console.error("Server availability check failed:", serverError);
      
      // Display a helpful error message with a retry button
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger">
            <p><strong>Error connecting to server:</strong> ${serverError.message}</p>
            <p>The backend server may not be running.</p>
            <div class="alert alert-info">
              <h5>How to start the backend server:</h5>
              <p>Run one of the following:</p>
              <ol>
                <li>Start with Python: <code>python start-backend.py</code> in the front-end directory</li>
                <li>Start with Batch: <code>start-backend.bat</code> in the front-end directory</li>
              </ol>
            </div>
            <button id="retryConnection" class="btn btn-primary mt-2">Retry Connection</button>
          </td>
        </tr>
      `;
      
      // Add event listener for retry button
      document.getElementById("retryConnection").addEventListener("click", () => {
        loadRooms();
      });
      
      return; // Stop further execution
    }
    
    // If server is reachable, continue with the request
    const headers = await getAuthHeaders();
    console.log("Using headers:", JSON.stringify(headers));
    
    // Add timeout for the main request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
    
    const response = await fetch(API_BASE_URL, {
      method: "GET",
      headers: headers,
      mode: 'cors',  // Explicitly set CORS mode
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    console.log("Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      throw new Error(`Failed to fetch rooms: ${response.status} - ${errorText}`);
    }

    const rooms = await response.json();
    console.log(`Received ${rooms.length} rooms`);
    populateRoomTable(rooms);
  } catch (error) {
    console.error("Error loading rooms:", error);
    const tableBody = document.getElementById("roomTableBody");
    
    // Handle specific error types
    let errorMessage = error.message;
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      errorMessage = "Cannot connect to the server. Please check your internet connection or if the backend server is running.";
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger">
            <p><strong>Connection Error:</strong> ${errorMessage}</p>
            <button id="retryConnection" class="btn btn-primary mt-2">Retry Connection</button>
          </td>
        </tr>
      `;
      
      // Add event listener for retry button
      document.getElementById("retryConnection").addEventListener("click", () => {
        loadRooms();
      });
    } else if (error.name === 'AbortError') {
      errorMessage = "Request timed out. The server might be too busy or unavailable.";
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger">
            <p><strong>Timeout Error:</strong> ${errorMessage}</p>
            <button id="retryConnection" class="btn btn-primary mt-2">Retry Connection</button>
          </td>
        </tr>
      `;
      
      // Add event listener for retry button
      document.getElementById("retryConnection").addEventListener("click", () => {
        loadRooms();
      });
    } else {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-danger">
            <p><strong>Error:</strong> ${errorMessage}</p>
            <button id="retryConnection" class="btn btn-primary mt-2">Retry Connection</button>
          </td>
        </tr>
      `;
      
      // Add event listener for retry button
      document.getElementById("retryConnection").addEventListener("click", () => {
        loadRooms();
      });
    }
    
    if (typeof showError === 'function') {
      showError(`Error loading rooms: ${errorMessage}`);
    } else {
      alert(`Error loading rooms: ${errorMessage}`);
    }
  }
}

// Populate table with rooms
function populateRoomTable(rooms) {
  const tableBody = document.getElementById("roomTableBody")
  tableBody.innerHTML = ""

  rooms.forEach((room) => {
    const row = document.createElement("tr")
    row.innerHTML = `
            <td>${room.room_id}</td>
            <td>${room.building}</td>
            <td>${room.room_number}</td>
            <td>${room.type}</td>
            <td>${room.capacity}</td>
            <td>
                <div class="dropdown">
                    <button class="btn btn-secondary btn-sm dropdown-toggle" type="button" id="dropdownMenuButton${room.room_id}" data-bs-toggle="dropdown" aria-expanded="false">
                        Actions
                    </button>
                    <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton${room.room_id}">
                        <li><a class="dropdown-item edit-room" href="#" data-id="${room.room_id}">Edit</a></li>
                        <li><a class="dropdown-item delete-room text-danger" href="#" data-id="${room.room_id}">Delete</a></li>
                    </ul>
                </div>
            </td>
        `
    tableBody.appendChild(row)
  })

  // Add event listeners for edit and delete actions
  document.querySelectorAll(".edit-room").forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault()
      const roomId = this.getAttribute("data-id")
      editRoom(roomId)
    })
  })

  // Add the missing event listener for delete buttons
  document.querySelectorAll(".delete-room").forEach((button) => {
    button.addEventListener("click", function (e) {
      e.preventDefault()
      const roomId = this.getAttribute("data-id")
      
      // Use SweetAlert2 for confirmation if available
      if (typeof showConfirmation === 'function') {
        showConfirmation("Are you sure you want to delete this room?", "Confirm Delete")
          .then(confirmed => {
            if (confirmed) {
              deleteRoom(roomId)
            }
          });
      } else if (confirm("Are you sure you want to delete this room?")) {
        deleteRoom(roomId)
      }
    })
  })
}

// Open modal to create or update a room
async function createOrUpdateRoom(event) {
  event.preventDefault();

  const roomId = document.getElementById("roomForm").dataset.roomId;
  const isUpdate = !!roomId;
  
  // Validate room type is one of the allowed values
  const roomType = document.getElementById("type").value;
  const allowedTypes = ["Lab", "Lecture", "Tutorial"];
  
  if (!allowedTypes.includes(roomType)) {
    if (typeof showError === 'function') {
      showError(`Invalid room type. Must be one of: ${allowedTypes.join(", ")}`);
    } else {
      alert(`Invalid room type. Must be one of: ${allowedTypes.join(", ")}`);
    }
    return;
  }
  
  const building = document.getElementById("building").value;
  const roomNumber = document.getElementById("room_number").value;
  
  // Validate room number is a number
  if (isNaN(parseInt(roomNumber))) {
    if (typeof showError === 'function') {
      showError("Room number must be a valid number");
    } else {
      alert("Room number must be a valid number");
    }
    return;
  }
  
  // Generate a room_id in the same format as the backend: building letter + zero-padded room number
  const generatedRoomId = isUpdate ? roomId : `${building}${roomNumber.toString().padStart(3, '0')}`;
  
  // Prepare room data with correct data types for the API
  const roomData = {
    building: building,
    room_number: parseInt(roomNumber), // Convert to integer as API expects
    capacity: parseInt(document.getElementById("capacity").value), // Convert to integer
    type: roomType,
    room_id: generatedRoomId
  };

  // Set URL and method based on operation type
  const method = isUpdate ? "PUT" : "POST";
  const url = isUpdate ? `${API_BASE_URL}${roomId}/` : API_BASE_URL;

  try {
    // Check if the backend server is reachable
    await checkServerAvailability();

    // Show loading indicator
    const loadingAlert = typeof showLoading === 'function' ?
      showLoading(`${isUpdate ? 'Updating' : 'Creating'} room...`) : null;
    
    console.log(`Sending ${method} request to URL: ${url}`);
    console.log("Room data:", JSON.stringify(roomData));
    
    const headers = await getAuthHeaders();
    console.log("Using headers:", JSON.stringify(headers));
    
    // Add timeout for the main request to avoid hanging indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
    
    const response = await fetch(url, {
      method: method,
      headers: headers,
      body: JSON.stringify(roomData),
      mode: 'cors',  // Explicitly set CORS mode
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    // Close loading indicator
    if (typeof closeLoading === 'function' && loadingAlert) {
      closeLoading(loadingAlert);
    }

    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error response: ${errorText}`);
      throw new Error(`Failed to save room: ${response.status} - ${errorText}`);
    }

    // Show success message
    if (typeof showSuccess === 'function') {
      showSuccess(`Room ${isUpdate ? 'updated' : 'created'} successfully!`);
    }
    
    loadRooms();
    closeModal();
  } catch (error) {
    console.error("Error saving room:", error);
    
    // Handle specific types of fetch errors
    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = "Request timed out. The server might be too busy or unavailable.";
    } else if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      errorMessage = "Cannot connect to the server. Please check your internet connection or the server status.";
    }
    
    if (typeof showError === 'function') {
      showError(`An error occurred while saving the room: ${errorMessage}`);
    } else {
      alert(`An error occurred while saving the room: ${errorMessage}`);
    }
  }
}

// Fetch room details and open edit modal
async function editRoom(roomId) {
  try {
    // Check if the backend server is reachable
    await checkServerAvailability();
    
    // Show loading indicator
    const loadingAlert = typeof showLoading === 'function' ?
      showLoading('Loading room details...') : null;
    
    // Ensure URL has proper trailing slash for Django REST compatibility
    const url = `${API_BASE_URL}${roomId}/`;
    console.log(`Fetching room details from: ${url}`);
    
    const headers = await getAuthHeaders();
    console.log("Using headers:", JSON.stringify(headers));
    
    // Add timeout for the request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
      
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
      mode: 'cors',  // Explicitly set CORS mode
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    // Close loading indicator
    if (typeof closeLoading === 'function' && loadingAlert) {
      closeLoading(loadingAlert);
    }
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error response: ${errorText}`);
      throw new Error(`Failed to fetch room details: ${response.status} - ${errorText}`);
    }

    const room = await response.json()
    console.log(`Room details received:`, room);
    
    document.getElementById("building").value = room.building
    document.getElementById("room_number").value = room.room_number
    document.getElementById("capacity").value = room.capacity
    document.getElementById("type").value = room.type

    document.getElementById("roomForm").dataset.roomId = roomId

    const modal = new bootstrap.Modal(document.getElementById("roomModal"))
    modal.show()
  } catch (error) {
    console.error("Error fetching room details:", error)
    
    // Handle specific types of fetch errors
    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = "Request timed out. The server might be too busy or unavailable.";
    } else if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      errorMessage = "Cannot connect to the server. Please check your internet connection or the server status.";
    }
    
    if (typeof showError === 'function') {
      showError(`An error occurred while fetching room details: ${errorMessage}`);
    } else {
      alert(`An error occurred while fetching room details: ${errorMessage}`);
    }
  }
}

// Delete a room
async function deleteRoom(roomId) {
  try {
    // Check if the backend server is reachable
    await checkServerAvailability();
    
    // Show loading indicator
    const loadingAlert = typeof showLoading === 'function' ?
      showLoading('Deleting room...') : null;
      
    // Make sure the API URL is correctly formatted
    const deleteUrl = `${API_BASE_URL}${roomId}/`;
    console.log(`Attempting to delete room at URL: ${deleteUrl}`);
    
    // Get authorization headers
    const headers = await getAuthHeaders();
    console.log("Using headers:", JSON.stringify(headers));
    
    // Add timeout for the request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
    
    // Make DELETE request
    const response = await fetch(deleteUrl, { 
      method: "DELETE", 
      headers: headers,
      mode: 'cors',  // Explicitly set CORS mode
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    // Close loading indicator
    if (typeof closeLoading === 'function' && loadingAlert) {
      closeLoading(loadingAlert);
    }
    
    // Check response status
    console.log(`Delete response status: ${response.status}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error response from server: ${errorText}`);
      throw new Error(`Failed to delete room: ${response.status} - ${errorText}`);
    }

    // Show success message
    if (typeof showSuccess === 'function') {
      showSuccess("Room deleted successfully!");
    } else {
      alert("Room deleted successfully!");
    }
    
    // Reload rooms list
    loadRooms();
  } catch (error) {
    console.error("Error deleting room:", error);
    
    // Handle specific types of fetch errors
    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = "Request timed out. The server might be too busy or unavailable.";
    } else if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      errorMessage = "Cannot connect to the server. Please check your internet connection or the server status.";
    }
    
    if (typeof showError === 'function') {
      showError(`Failed to delete room: ${errorMessage}`);
    } else {
      alert(`Failed to delete room: ${errorMessage}`);
    }
  }
}

// Close modal and reset form
function closeModal() {
  const modal = bootstrap.Modal.getInstance(document.getElementById("roomModal"))
  modal.hide()
  document.getElementById("roomForm").reset()
  delete document.getElementById("roomForm").dataset.roomId
}

// Event listener from form submission
document.getElementById("roomForm").addEventListener("submit", createOrUpdateRoom)

