from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum

def get_utc_now():
    return datetime.now(timezone.utc)

class EnrollmentStatus(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"
    WITHDRAWN = "Withdrawn"
    
class EnrollmentCreate(BaseModel):
    student_id: str
    course_id: str
    
    @field_validator('student_id')
    def validate_student_id(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('Invalid student ID')
        return v
    
    @field_validator('course_id')
    def validate_course_id(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('Invalid course ID')
        return v
    
class Enrollment(BaseModel):
    student_id: str
    course_id: str
    registered_at: datetime = Field(default_factory=get_utc_now)
    status: EnrollmentStatus = Field(default=EnrollmentStatus.PENDING)
    created_at: datetime = Field(default_factory=get_utc_now)
    last_updated: datetime = Field(default_factory=get_utc_now)
    
    class Config:
        use_enum_values = True
        json_encoders = {
            datetime: lambda v: v.isoformat()  # Fixed typo: isformat -> isoformat
        }
        
class EnrollmentResponse(BaseModel):
    student_id: str
    course_id: str
    course_name: str
    credit_hours: int
    status: EnrollmentStatus
    registered_at: datetime
    
    class Config:
        use_enum_values = True
        
class CourseAvailabilityResponse(BaseModel):
    course_id: str
    name: str
    description: str
    credit_hours: int
    department_name: str
    prerequisites: List[str]
    can_enroll: bool
    reason: Optional[str] = None

