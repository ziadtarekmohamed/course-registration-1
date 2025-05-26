from database import users_collection, courses_collection, departments_collection, rooms_collection, time_slots_collection
from datetime import datetime

async def get_next_id(user_type: str):
    """Generates a unique ID based on user type(Student, Instructor, Admin, Major)"""
    print(user_type)
    prefix_mapping = {
        "student": "23010",
        "instructor": "INST-",
        "admin": "ADMIN-",
        "major": "MAJ-"
    }
    
    prefix = prefix_mapping[user_type]
    
    # Find the last document with the given prefix
    last_user = await users_collection.find_one(
        {f"{user_type}_id": {"$regex": f"^{prefix}"}},
        sort=[(f"{user_type}_id", -1)]
    )
    
    if last_user:
        last_id = last_user[f"{user_type}_id"]
        next_suffix = int(last_id[len(prefix):]) + 1
    else:
        next_suffix = 1
    
    return f"{prefix}{str(next_suffix).zfill(4)}"

async def get_next_course_id():
    """Generates a unique course ID"""
    last_course = await courses_collection.find_one({}, sort=[("course_id", -1)])
    next_suffix = int(last_course["course_id"][4:] if last_course else 1) + 1
    return f"COUR{str(next_suffix).zfill(4)}"

async def get_next_department_id():
    """Generates a unique department ID"""
    last_department = await departments_collection.find_one({}, sort=[("department_id", -1)])
    next_suffix = int (last_department["department_id"][4:] if last_department else 1) +1
    return f"DEPT{str(next_suffix).zfill(4)}"

async def generate_room_id(building: str, room_number: int) -> str:
    """Generates a unique room ID (Building Letter + 3-digit Number)"""
    return f"{building}{str(room_number).zfill(3)}"
    

async def generate_slot_id():
    """Generates a unique Time Slot ID based on timestamp"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S") # e.g., TS-20240308153045
    return f"TS-{timestamp}"

def serialize_doc(doc):
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    return doc