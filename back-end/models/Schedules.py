from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from datetime import datetime, time
from enum import Enum

class DayOfWeek(str, Enum):
    SUNDAY = "Sunday"
    MONDAY = "Monday"
    TUESDAY = "Tuesday"
    WEDNESDAY = "Wednesday"
    THURSDAY = "Thursday"
    FRIDAY = "Friday"
    SATURDAY = "Saturday"

class TimeSlotType(str, Enum):
    LECTURE = "Lecture"
    LAB = "Lab"
    TUTORIAL = "Tutorial"

class TimeSlotCreate(BaseModel):
    course_id: str
    slot_id: str
    
class TimeSlot(BaseModel):
    slot_id: str
    course_id: str
    day: DayOfWeek
    start_time: time
    end_time: time
    type: TimeSlotType
    room_id: str
    room_name: str
    instructor_id: Optional[str] = None
    instructor_name: Optional[str] = None
    
class TimeSlotResponse(BaseModel):
    slot_id: str
    course_id: str
    course_name: str
    day: DayOfWeek
    start_time: time
    end_time: time
    type: TimeSlotType
    room_id: str
    room_name: str
    instructor_id: Optional[str] = None
    instructor_name: Optional[str] = None
    
class ScheduleResponse(BaseModel):
    student_id: str
    semester: str
    total_courses: int
    total_credit_hours: int
    weekly_class_hours: float
    schedule: Dict[DayOfWeek, List[TimeSlotResponse]]
    
class ScheduleConflictResponse(BaseModel):
    day: DayOfWeek
    course1_id: str
    course1_name: str
    course1_type: TimeSlotType
    course1_time: str
    course2_id: str
    course2_name: str
    course2_type: TimeSlotType
    course2_time: str