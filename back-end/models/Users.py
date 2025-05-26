from pydantic import BaseModel, EmailStr, Field
from typing import Optional
   
class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    phone: str = Field(..., min_length=10, max_length=15)
    address: Optional[str] = ""

class Student(UserBase):
    student_id: Optional[str] = None #Auto-generated
    GPA: float = Field(..., ge=0.0, le=4.0)
    credit_hours: int = Field(..., gt=0)
    major: str = Field(..., min_length=2, max_length=100)
    password: str
    role: str
    
class Instructor(UserBase):
    instructor_id: Optional[str] = None
    department_id: str
    password: str
    role: str

class Admin(UserBase):
    admin_id: Optional[str] = None
    password: str
    role: str
    
class UpdateUserModel(BaseModel):
    name: str
    email: str
    phone: str
    address: str
    GPA: float = None