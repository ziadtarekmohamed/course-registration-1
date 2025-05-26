"""
Backend Starter Script

This Python script starts the FastAPI backend server for the Course Registration System.
It's more reliable than the batch file approach and works across platforms.
"""
import os
import sys
import subprocess
import platform

def main():
    print("=" * 50)
    print("Course Registration System Backend Starter")
    print("=" * 50)
    
    # Determine the backend directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(os.path.dirname(current_dir), 'back-end')
    
    print(f"Current directory: {current_dir}")
    print(f"Backend directory: {backend_dir}")
    
    # Change to the backend directory
    os.chdir(backend_dir)
    print(f"Changed to directory: {os.getcwd()}")
    
    # Try to find Python executable
    python_cmd = "python"
    if platform.system() == "Windows":
        try:
            # Try Python with version
            subprocess.run(["py", "-3", "--version"], check=True, capture_output=True)
            python_cmd = "py -3"
        except (subprocess.SubprocessError, FileNotFoundError):
            try:
                # Try regular python command
                subprocess.run(["python", "--version"], check=True, capture_output=True)
                python_cmd = "python"
            except (subprocess.SubprocessError, FileNotFoundError):
                print("Error: Python not found. Please install Python 3.8 or higher.")
                sys.exit(1)
    
    # Check if we're in a virtual environment
    in_venv = sys.prefix != sys.base_prefix
    if not in_venv:
        print("Not running in a virtual environment. Attempting to activate or create one.")
        
        venv_paths = [
            os.path.join(os.path.dirname(backend_dir), "venv"),
            os.path.join(os.path.dirname(backend_dir), ".venv")
        ]
        
        venv_activated = False
        for venv_path in venv_paths:
            activate_script = os.path.join(venv_path, "Scripts", "activate") if platform.system() == "Windows" else os.path.join(venv_path, "bin", "activate")
            if os.path.exists(activate_script):
                print(f"Found virtual environment at {venv_path}")
                # For Windows
                if platform.system() == "Windows":
                    command = f"cd {backend_dir} && {activate_script} && {python_cmd} -m uvicorn app:app --reload --host 127.0.0.1 --port 8000"
                    print(f"Running command: {command}")
                    subprocess.run(command, shell=True)
                # For Unix-like
                else:
                    command = f"source {activate_script} && cd {backend_dir} && {python_cmd} -m uvicorn app:app --reload --host 127.0.0.1 --port 8000"
                    print(f"Running command: {command}")
                    subprocess.run(command, shell=True)
                venv_activated = True
                break
    
    # Start the FastAPI server directly if we're already in a venv or couldn't activate one
    if in_venv or not venv_activated:
        print("Starting FastAPI server...")
        command = f"{python_cmd} -m uvicorn app:app --reload --host 127.0.0.1 --port 8000"
        print(f"Running command: {command}")
        subprocess.run(command, shell=True)
    
    print("Server has stopped.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nServer stopped by user.")
    except Exception as e:
        print(f"Error starting server: {e}")
        import traceback
        traceback.print_exc()
    
    # Keep console open on Windows
    if platform.system() == "Windows":
        input("Press Enter to close this window...") 