from pydantic import BaseModel, Field, validator
from typing import Optional

class Room(BaseModel):
    room_id: Optional[str] = None
    building: str = Field(..., pattern="^[A-Z]$")
    room_number: int = Field(..., ge=1, le=999)
    capacity: int = Field(..., ge=1)
    type: str = Field(..., pattern="^(Lab|Lecture|Tutorial)$")

    @validator('room_id')
    def validate_room_id(cls, v):
        if v is None:
            return v
        if not v:
            raise ValueError("Room ID cannot be empty if provided")
        return v

    @validator('building')
    def validate_building(cls, v):
        if not v.isalpha() or not v.isupper():
            raise ValueError("Building must be a single uppercase letter")
        return v

    @validator('room_number')
    def validate_room_number(cls, v):
        if not 1 <= v <= 999:
            raise ValueError("Room number must be between 1 and 999")
        return v

    @validator('capacity')
    def validate_capacity(cls, v):
        if v < 1:
            raise ValueError("Capacity must be at least 1")
        return v

    @validator('type')
    def validate_type(cls, v):
        valid_types = ["Lab", "Lecture", "Tutorial"]
        if v not in valid_types:
            raise ValueError(f"Type must be one of: {', '.join(valid_types)}")
        return v

class RoomUpdate(BaseModel):
    building: Optional[str] = None
    room_number: Optional[int] = None
    capacity: Optional[int] = None
    type: Optional[str] = None

    @validator('building')
    def validate_building(cls, v):
        if v is not None and (not v.isalpha() or not v.isupper()):
            raise ValueError("Building must be a single uppercase letter")
        return v

    @validator('room_number')
    def validate_room_number(cls, v):
        if v is not None and not (1 <= v <= 999):
            raise ValueError("Room number must be between 1 and 999")
        return v

    @validator('capacity')
    def validate_capacity(cls, v):
        if v is not None and v < 1:
            raise ValueError("Capacity must be at least 1")
        return v

    @validator('type')
    def validate_type(cls, v):
        if v is not None:
            valid_types = ["Lab", "Lecture", "Tutorial"]
            if v not in valid_types:
                raise ValueError(f"Type must be one of: {', '.join(valid_types)}")
        return v