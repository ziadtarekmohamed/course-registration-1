from pydantic import BaseModel, Field
from typing import Optional

class Major(BaseModel):
    major_id: Optional[str] = None  # Auto-generated or assigned
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500) 