# Course Registration System - Frontend

This is the frontend for the Course Registration System.

## Running the Application

### Step 1: Start the Backend Server

Before running the frontend, you need to start the backend server:

1. Navigate to the `front-end` directory in your terminal:
   ```
   cd path/to/Course-Registration-System-1/Course Registration Revised/front-end
   ```

2. Run one of the following commands:
   - Using Python (recommended):
     ```
     python start-backend.py
     ```
   - Using Batch file (Windows only):
     ```
     start-backend.bat
     ```

3. Wait for the backend server to start. You should see a message indicating the server is running at http://127.0.0.1:8000.

### Step 2: Start the Frontend

Open the HTML files directly in your browser or use a local development server like Live Server in VS Code.

## Troubleshooting

### "Failed to fetch" or CORS Errors

If you see "Failed to fetch" errors in the console, check:

1. Is the backend server running? Check your terminal for the backend server logs.
2. Is the backend server running on port 8000? The frontend expects the API at http://127.0.0.1:8000/.
3. Are there any CORS issues? Use the test-backend.html tool to diagnose connection issues.

### Testing Backend Connectivity

A test tool is included to check if the backend is working properly:

1. Open `test-backend.html` in your browser
2. Click "Test Connection" to check if the server is reachable
3. Click "Test CORS" to verify CORS is configured correctly
4. Click "Test Get Rooms" to verify API access

### Room Management Issues

If you're having problems with room management (create, update, delete):

1. Check browser console for specific error messages
2. Verify you're logged in as an admin user
3. Make sure all required fields are provided and valid

## Development

For development and debugging:

1. Use browser developer tools to check for console errors
2. Look at the backend terminal for server-side errors
3. Check network requests in your browser's Network tab to see API responses 