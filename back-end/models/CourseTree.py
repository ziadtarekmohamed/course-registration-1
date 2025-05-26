from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class CourseTreeNode(BaseModel):
    """Model for a node in the course tree"""
    course_id: str
    name: str
    department_id: str
    department_name: Optional[str] = None
    credit_hours: int
    prerequisites: Optional[List[str]] = []
    children: Optional[List[Dict[str, Any]]] = []
    semesters: Optional[List[str]] = []  # Fall, Spring, Summer
    level: Optional[int] = Field(None, ge=1, le=4)  # Level 1-4

class CourseTreeFilter(BaseModel):
    """Model for filtering the course tree"""
    department_id: Optional[str] = None
    level: Optional[int] = None
    search: Optional[str] = None