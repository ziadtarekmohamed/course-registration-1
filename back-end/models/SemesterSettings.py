from pydantic import BaseModel
from typing import Optional, List
from enum import Enum
from datetime import datetime

class SemesterType(str, Enum):
    FALL = "Fall"
    SPRING = "Spring"
    SUMMER = "Summer"
    
class RegistrationPeriodSettings(BaseModel):
    """Model for registration period settings"""
    registration_start_date: Optional[datetime] = None
    registration_end_date: Optional[datetime] = None
    withdrawal_start_date: Optional[datetime] = None
    withdrawal_end_date: Optional[datetime] = None
    registration_enabled: bool = False
    withdrawal_enabled: bool = False
    
class SemesterSettings(BaseModel):
    """Model for storing current semester settings"""
    current_semester: SemesterType
    academic_year: str
    start_date: str
    end_date: str
    registration_periods: Optional[RegistrationPeriodSettings] = None
    
class SemesterUpdate(BaseModel):
    """Model for updating semester settings"""
    current_semester: Optional[SemesterType] = None
    academic_year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    registration_periods: Optional[RegistrationPeriodSettings] = None