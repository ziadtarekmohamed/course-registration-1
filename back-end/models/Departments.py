from pydantic import BaseModel, Field
from typing import Optional

class Department(BaseModel):
    department_id: Optional[str] = Field(None, alias="_id")
    name: str = Field(..., min_length=2, max_length=100)