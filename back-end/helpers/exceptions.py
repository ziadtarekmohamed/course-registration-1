class EnrollmentError(Exception):
    """Base exception for enrollment errors"""
    pass

class ScheduleError(Exception):
    """Base exception for schedule errors"""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)

class ScheduleConflictError(ScheduleError):
    """Exception for schedule conflicts"""
    def __init__(self, message: str):
        super().__init__(message)

