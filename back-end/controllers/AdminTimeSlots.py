from fastapi import APIRouter, HTTPException, Depends
from database import time_slots_collection, rooms_collection, courses_collection, users_collection
from models.TimeSlots import TimeSlot
from helpers.auth import get_current_user, TokenData
from helpers.helpers import generate_slot_id
from datetime import datetime

router = APIRouter()

# Create Time Slot
@router.post("/time-slots/")
async def create_time_slot(time_slot: TimeSlot, user: TokenData = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    try:
        # Validate room existence
        room = await rooms_collection.find_one({"room_id": time_slot.room_id})
        if not room:
            raise HTTPException(status_code=400, detail="Invalid room ID")
        
        # Validate instructor existence (if provided)
        if time_slot.instructor_id:
            instructor = await users_collection.find_one({"instructor_id": time_slot.instructor_id})
            if not instructor:
                raise HTTPException(status_code=400, detail="Invalid instructor ID")
            
        # Validate course existence (if provided)
        if time_slot.course_id:
            course = await courses_collection.find_one({"course_id": time_slot.course_id})
            if not course:
                raise HTTPException(status_code=400, detail="Invalid course ID")
            
        # Convert time objects to strings for MongoDB query
        start_time_str = time_slot.start_time.strftime("%H:%M:%S")
        end_time_str = time_slot.end_time.strftime("%H:%M:%S")
            
        # Prevent conflicting time slots for the same room
        existing_slot = await time_slots_collection.find_one({
            "room_id": time_slot.room_id,
            "day": time_slot.day,
            "$or": [
                {
                    "$and": [
                        {"start_time": {"$lte": start_time_str}},
                        {"end_time": {"$gt": start_time_str}}
                    ]
                },
                {
                    "$and": [
                        {"start_time": {"$lt": end_time_str}},
                        {"end_time": {"$gte": end_time_str}}
                    ]
                },
                {
                    "$and": [
                        {"start_time": {"$gte": start_time_str}},
                        {"end_time": {"$lte": end_time_str}}
                    ]
                }
            ]
        })
        
        if existing_slot:
            raise HTTPException(status_code=400, detail="Time slot conflicts with an existing booking")
        
        slot_id = await generate_slot_id()
        time_slot_data = time_slot.model_dump()
        time_slot_data["slot_id"] = slot_id
        # Convert time objects to strings in the data to be stored
        time_slot_data["start_time"] = start_time_str
        time_slot_data["end_time"] = end_time_str
        
        await time_slots_collection.insert_one(time_slot_data)
        return {"message": "Time slot created successfully", "slot_id": slot_id}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

# Get all time slots
@router.get("/time-slots/")
async def get_time_slots(user: TokenData = Depends(get_current_user)):
    try:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        # Get all time slots and convert ObjectId to string
        time_slots = await time_slots_collection.find().to_list(100)
        
        # Convert time slots to dict and ensure all fields are properly formatted
        formatted_slots = []
        for slot in time_slots:
            slot_dict = {
                "slot_id": slot.get("slot_id"),
                "room_id": slot.get("room_id"),
                "day": slot.get("day"),
                "start_time": slot.get("start_time"),
                "end_time": slot.get("end_time"),
                "type": slot.get("type"),
                "instructor_id": slot.get("instructor_id"),
                "course_id": slot.get("course_id")
            }
            formatted_slots.append(slot_dict)
        
        return formatted_slots
    except Exception as e:
        print(f"Error in get_time_slots: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving time slots: {str(e)}")

# Get Time Slot by ID
@router.get("/time-slots/{slot_id}")
async def get_time_slot(slot_id: str, user: TokenData = Depends(get_current_user)):
    try:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        time_slot = await time_slots_collection.find_one({"slot_id": slot_id})
        if not time_slot:
            raise HTTPException(status_code=404, detail=f"Time slot with ID {slot_id} not found")
        
        # Convert MongoDB document to dict and ensure all fields are properly formatted
        slot_dict = {
            "slot_id": time_slot.get("slot_id"),
            "room_id": time_slot.get("room_id"),
            "day": time_slot.get("day"),
            "start_time": time_slot.get("start_time"),
            "end_time": time_slot.get("end_time"),
            "type": time_slot.get("type"),
            "instructor_id": time_slot.get("instructor_id"),
            "course_id": time_slot.get("course_id")
        }
        
        return slot_dict
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_time_slot: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving time slot: {str(e)}")

# Update Time Slot
@router.put("/time-slots/{slot_id}")
async def update_time_slot(slot_id: str, updated_data: dict, user: TokenData = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await time_slots_collection.update_one({"slot_id": slot_id}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Time slot not found")
    return {"message": "Time slot updated successfully"}

# Delete time slot
@router.delete("/time-slots/{slot_id}")
async def delete_time_slot(slot_id: str, user: TokenData = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await time_slots_collection.delete_one({"slot_id": slot_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Time slot not found")
    
    return {"message": f"Time slot {slot_id} deleted successfully"}

# Get time slots by course ID - endpoint for student course registration
@router.get("/time-slots/course/{course_id}")
async def get_time_slots_by_course(course_id: str, user: TokenData = Depends(get_current_user)):
    try:
        # Verify the course exists
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course with ID {course_id} not found")
        
        # Get all time slots for this course
        time_slots = await time_slots_collection.find({"course_id": course_id}).to_list(100)
        
        if not time_slots:
            return []
        
        # Convert time slots to dict and ensure all fields are properly formatted
        formatted_slots = []
        for slot in time_slots:
            # Get instructor name if instructor_id is available
            instructor_name = None
            if slot.get("instructor_id"):
                instructor = await users_collection.find_one({"instructor_id": slot.get("instructor_id")})
                if instructor:
                    instructor_name = instructor.get("name")
            
            slot_dict = {
                "slot_id": slot.get("slot_id"),
                "room_id": slot.get("room_id"),
                "day": slot.get("day"),
                "start_time": slot.get("start_time"),
                "end_time": slot.get("end_time"),
                "type": slot.get("type"),
                "instructor_id": slot.get("instructor_id"),
                "instructor_name": instructor_name,
                "course_id": slot.get("course_id")
            }
            formatted_slots.append(slot_dict)
        
        return formatted_slots
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_time_slots_by_course: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving time slots: {str(e)}")