from pydantic import BaseModel, Field
from typing import Optional
from pydanticObjectId import *

class Session(BaseModel):
    id: Optional[PydanticObjectId]
    course_id: PydanticObjectId
    instruction_type: str = Field(..., regex="^(Lecture|Lab|Tutorial)$")
    day: str = Field(..., regex="(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$")
    start_time: str = Field(..., regex="^([01\d|2[0-3]:[0-5]\d$)")
    end_time: str = Field(..., regex="^([01\d|2[0-3]:[0-5]\d$)")
    instructor_id:PydanticObjectId
    