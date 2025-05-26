document.getElementById("loginForm").addEventListener("submit", async function(event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const errorMessage = document.getElementById("error-message");

    // Reset error message
    errorMessage.textContent = "";
    errorMessage.style.display = "none";

    // Basic Input Validation
    if (!email || !password) {
        errorMessage.textContent = "Email and password cannot be empty.";
        errorMessage.style.display = "block";
        return;
    }

    // Email Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRegex.test(email)) {
        errorMessage.textContent = "Invalid email format.";
        errorMessage.style.display = "block";
        return;
    }

    // Show loading state
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = "Logging in...";
    submitButton.disabled = true;

    const formData = new URLSearchParams();
    formData.append("username", email);
    formData.append("password", password);

    try {
        console.log("Attempting login for:", email);
        const response = await fetch(`http://127.0.0.1:8000/api/auth/login`, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: formData
        });

        if(!response.ok) {
            throw new Error("Invalid email or password");
        }

        const data = await response.json();
        console.log("Login successful, received token");
        
        // Clear any existing localStorage items to prevent naming confusion
        localStorage.clear();
        
        // Store the tokens securely - use "token" and "userId" to match what the rest of the app expects
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("refreshToken", data.refresh_token);
        
        // Parse the token to get user information
        const tokenParts = data.access_token.split(".");
        if (tokenParts.length !== 3) {
            throw new Error("Invalid token format");
        }
        
        try {
            console.log("Parsing token payload");
            const payload = JSON.parse(atob(tokenParts[1]));
            console.log("Token payload:", payload);
            
            const role = payload.role;
            const userId = payload.user_id;
            
            // Store user info for session - use the keys expected by other parts of the app
            localStorage.setItem("userRole", role);
            localStorage.setItem("userId", userId);
            localStorage.setItem("userEmail", payload.sub);
            localStorage.setItem("userName", payload.name || "");
            
            console.log("Login successful, stored token and user data");
            console.log("userRole:", role);
            console.log("userId:", userId);
            console.log("localStorage keys:", Object.keys(localStorage));
            
            // Add a small delay to make sure localStorage is updated
            setTimeout(() => {
                // Redirect based on role
                console.log("Redirecting to dashboard based on role:", role);
                if(role === "admin") {
                    window.location.href = "AdminDashboard.html";
                } else if(role === "instructor") {
                    window.location.href = "InstructorDashboard.html";
                } else if(role === "student") {
                    window.location.href = "StudentDashboard.html";
                } else {
                    throw new Error("Unknown user role. Please contact support.");
                }
            }, 100);
        } catch (parseError) {
            console.error("Token parsing error:", parseError);
            throw new Error("Error processing authentication. Please try again.");
        }
    } catch(error) {
        console.error("Login Error:", error.message);
        errorMessage.textContent = error.message;
        errorMessage.style.display = "block";
        
        // Reset button state
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    }
});

// Check if token exists and is valid on page load
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem("token"); // Changed from access_token to token
    
    if (token) {
        try {
            // Check if token is expired
            const payload = JSON.parse(atob(token.split(".")[1]));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            
            if (Date.now() < expiry) {
                // Token is still valid, redirect to appropriate dashboard
                const role = payload.role;
                
                if(role === "admin") {
                    window.location.href = "AdminDashboard.html";
                } else if(role === "instructor") {
                    window.location.href = "InstructorDashboard.html";
                } else if(role === "student") {
                    window.location.href = "StudentDashboard.html";
                }
            } else {
                // Token expired, try to refresh
                const refreshToken = localStorage.getItem("refreshToken"); // Changed from refresh_token
                if (refreshToken) {
                    refreshAccessToken(refreshToken);
                } else {
                    // No refresh token, clear storage and stay on login page
                    clearAuthStorage();
                }
            }
        } catch (e) {
            // Invalid token format, clear storage
            console.error("Token validation error:", e);
            clearAuthStorage();
        }
    }
});

// Function to refresh access token
async function refreshAccessToken(refreshToken) {
    try {
        const response = await fetch('http://127.0.0.1:8000/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem("token", data.access_token); // Changed from access_token to token
            localStorage.setItem("refreshToken", data.refresh_token); // Changed from refresh_token to refreshToken
            
            // Redirect to appropriate dashboard
            const payload = JSON.parse(atob(data.access_token.split(".")[1]));
            const role = payload.role;
            
            if(role === "admin") {
                window.location.href = "AdminDashboard.html";
            } else if(role === "instructor") {
                window.location.href = "InstructorDashboard.html";
            } else if(role === "student") {
                window.location.href = "StudentDashboard.html";
            }
        } else {
            clearAuthStorage();
        }
    } catch (error) {
        console.error("Token refresh error:", error);
        clearAuthStorage();
    }
}

// Function to clear authentication storage
function clearAuthStorage() {
    localStorage.removeItem("token"); // Changed from access_token to token
    localStorage.removeItem("refreshToken"); // Changed from refresh_token to refreshToken
    localStorage.removeItem("userRole"); // Changed from user_role to userRole
    localStorage.removeItem("userId"); // Changed from user_id to userId
    localStorage.removeItem("userEmail"); // Changed from user_email to userEmail
    localStorage.removeItem("userName"); // Changed from user_name to userName
}