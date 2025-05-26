@echo off
echo ================================================
echo   Course Registration System - Backend Starter
echo ================================================
echo.

cd ..\back-end
echo Current directory: %CD%
echo.

:: Check if Python is installed
echo Checking Python installation...
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Python is not installed or not in PATH.
  echo Please install Python 3.8 or higher from https://www.python.org/downloads/
  goto :error
)

python --version
echo.

:: Try to activate virtual environment if it exists
echo Checking for virtual environment...
if exist ..\venv\Scripts\activate.bat (
  echo Found virtual environment at ..\venv
  call ..\venv\Scripts\activate.bat
  echo Activated virtual environment.
) else if exist ..\.venv\Scripts\activate.bat (
  echo Found virtual environment at ..\.venv
  call ..\.venv\Scripts\activate.bat
  echo Activated virtual environment.
) else (
  echo No virtual environment found. Creating a new one...
  python -m venv ..\venv
  if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create virtual environment.
    goto :error
  )
  call ..\venv\Scripts\activate.bat
  echo Virtual environment created and activated.
)
echo.

:: Install required packages
echo Checking for required packages...
pip install -q fastapi uvicorn motor python-multipart python-jose pydantic passlib python-dotenv
if %ERRORLEVEL% NEQ 0 (
  echo [WARNING] Some packages may not have installed correctly.
)
echo Required packages installed.
echo.

:: Check if database connection works
echo Checking database connection...
python check_mongo.py
if %ERRORLEVEL% NEQ 0 (
  echo [WARNING] Database connection test failed. The application may not work correctly.
  echo Server will still attempt to start, but may encounter errors.
  echo.
)

:: Start the FastAPI server
echo.
echo ================================================
echo Starting FastAPI server with uvicorn...
echo ================================================
echo.
echo Server will be available at: http://127.0.0.1:8000
echo.
echo Press CTRL+C to stop the server.
echo ================================================
echo.

python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

goto :end

:error
echo.
echo ================================================
echo            ERROR STARTING SERVER
echo ================================================
echo.
echo Please check the errors above and try again.
echo.
pause
exit /b 1

:end
:: If the server exits for any reason
echo.
echo Server has stopped. Press any key to close this window.
pause 