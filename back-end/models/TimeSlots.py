from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import time, datetime

class TimeSlot(BaseModel):
    slot_id: Optional[str] = None
    room_id: str = Field(..., min_length=1)
    day: str = Field(..., pattern="^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$")
    start_time: time
    end_time: time
    type: str = Field(..., pattern="^(Lab|Lecture|Tutorial)$")
    instructor_id: Optional[str] = None
    course_id: Optional[str] = None

    @validator('start_time', 'end_time', pre=True)
    def validate_time(cls, v):
        if isinstance(v, str):
            # Try different time formats
            formats = [
                "%H:%M:%S",  # 24-hour with seconds
                "%H:%M",     # 24-hour without seconds
                "%I:%M:%S %p",  # 12-hour with seconds
                "%I:%M %p",     # 12-hour without seconds
                "%H",           # Just hours in 24-hour format
                "%I %p"         # Just hours in 12-hour format
            ]
            
            # Clean up the input string
            v = v.strip().upper()
            
            for fmt in formats:
                try:
                    parsed_time = datetime.strptime(v, fmt).time()
                    # If format was just hours, set minutes and seconds to 0
                    if fmt in ["%H", "%I %p"]:
                        return time(parsed_time.hour, 0, 0)
                    return parsed_time
                except ValueError:
                    continue
            
            raise ValueError(
                "Invalid time format. Please use one of these formats:\n"
                "- HH:MM:SS (e.g., 09:30:00)\n"
                "- HH:MM (e.g., 09:30)\n"
                "- HH (e.g., 09)\n"
                "- HH:MM AM/PM (e.g., 09:30 AM)\n"
                "- HH AM/PM (e.g., 9 AM)"
            )
        return v

    @validator('end_time')
    def validate_end_time(cls, v, values):
        if 'start_time' in values and v <= values['start_time']:
            raise ValueError("End time must be after start time")
        return v

    @validator('room_id')
    def validate_room_id(cls, v):
        if not v:
            raise ValueError("Room ID is required")
        return v

    @validator('instructor_id', 'course_id')
    def validate_optional_fields(cls, v):
        if v is not None and not v.strip():
            return None
        return v

    class Config:
        json_encoders = {
            time: lambda v: v.strftime("%H:%M:%S")
        }