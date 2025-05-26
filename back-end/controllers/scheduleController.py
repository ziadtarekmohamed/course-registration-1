from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Optional, Any
from datetime import datetime, time, timezone
from models.Enrollments import EnrollmentStatus
from models.Schedules import (
    TimeSlotCreate,
    TimeSlot,
    TimeSlotResponse,
    ScheduleResponse,
    ScheduleConflictResponse,
    DayOfWeek,
    TimeSlotType
)
from database import (
    enrollments_collection,
    time_slots_collection,
    courses_collection,
    users_collection,
    rooms_collection,
    schedules_collection
)
from helpers.auth import get_current_active_user, TokenData
from helpers.exceptions import ScheduleError
import time as time_module
from bson import ObjectId

router = APIRouter()

# Cache for time slots to improve performance
TIME_SLOTS_CACHE = {
    "data": {},
    "timestamp": {},
    "ttl": 300 # 5 minutes
}

# Cache for time slot seats
SEAT_COUNT_CACHE = {
    "data": {},
    "timestamp": {},
    "ttl": 60  # 1 minute - shorter TTL since this data changes more frequently
}

def time_to_minutes(t: time | str) -> int:
    """Convert time to minutes since midnight for easier comparison"""
    if isinstance(t, time):
        return t.hour * 60 + t.minute
    
    # Handle string time formats
    try:
        # Clean up the input string
        t = t.strip().upper()
        
        # Try different time formats
        formats = [
            "%H:%M:%S",  # 24-hour with seconds
            "%H:%M",     # 24-hour without seconds
            "%I:%M:%S %p",  # 12-hour with seconds
            "%I:%M %p",     # 12-hour without seconds
            "%H",           # Just hours in 24-hour format
            "%I %p"         # Just hours in 12-hour format
        ]
        
        for fmt in formats:
            try:
                parsed_time = datetime.strptime(t, fmt).time()
                return parsed_time.hour * 60 + parsed_time.minute
            except ValueError:
                continue
                
        raise ValueError(f"Invalid time format: {t}")
    except Exception as e:
        raise ValueError(f"Error parsing time: {str(e)}")

def check_time_overlap(start1: time | str, end1: time | str, start2: time | str, end2: time | str) -> bool:
    """Check if two time periods overlap"""
    start1_mins = time_to_minutes(start1)
    end1_mins = time_to_minutes(end1)
    start2_mins = time_to_minutes(start2)
    end2_mins = time_to_minutes(end2)

    return max(start1_mins, start2_mins) < min(end1_mins, end2_mins)

async def get_available_time_slots(course_id: str, slot_type: TimeSlotType) -> List[TimeSlot]:
    """Get all available time slots for a course and slot type"""
    # Check cache first
    cache_key = f"time_slots_{course_id}_{slot_type}"
    if cache_key in TIME_SLOTS_CACHE["data"] and cache_key in TIME_SLOTS_CACHE["timestamp"]:
        if time_module.time() - TIME_SLOTS_CACHE["timestamp"][cache_key] < TIME_SLOTS_CACHE["ttl"]:
            return TIME_SLOTS_CACHE["data"][cache_key]
    # Get time slots fro the course and type
    time_slots = await time_slots_collection.find({"course_id": course_id, "type": slot_type}).to_list(None)
    
    # Get room details for each time slot
    result = []
    for slot in time_slots:
        room = await rooms_collection.find_one({"room_id": slot["room_id"]})
        room_name = f"{room['building']}-{room['room_number']}" if room else "Unknown"
        
        instructor = None
        if slot.get("instructor_id"):
            instructor = await users_collection.find_one({"instructor_id": slot['instructor_id']})
        
        result.append(TimeSlot(
            slot_id=slot["slot_id"],
            course_id=slot["course_id"],
            day=slot["day"],
            start_time=slot["start_time"],
            end_time=slot["end_time"],
            type=slot["type"],
            room_id=slot["room_id"],
            room_name=room_name,
            instructor_id=slot.get("instructor_id"),
            instructor_name=instructor["name"] if instructor else None
        ))
    
    # Update cache
    TIME_SLOTS_CACHE["data"][cache_key] = result
    TIME_SLOTS_CACHE["timestamp"][cache_key] = time_module.time()
    return result

async def check_schedule_conflicts(
    student_id: str,
    day: DayOfWeek,
    start_time: time,
    end_time: time,
) -> tuple[bool, str]:
    """
    Check if time slot conflicts with the student's existing schedule
    Returns: (has_conflict, conflict_details)
    """
    # Get student's current schedule
    schedule = await schedules_collection.find({
        "student_id": student_id,
        "day": day
    }).to_list(None)

    for slot in schedule:
        if check_time_overlap(start_time, end_time, slot["start_time"], slot["end_time"]):
            # Get course details for better error message
            course = await courses_collection.find_one({"course_id": slot["course_id"]})
            course_name = course["name"] if course else slot["course_id"]
            
            # Format time strings
            start_str = slot["start_time"] if isinstance(slot["start_time"], str) else slot["start_time"].strftime("%H:%M")
            end_str = slot["end_time"] if isinstance(slot["end_time"], str) else slot["end_time"].strftime("%H:%M")
            
            return True, f"Time conflict with {course_name} at {slot['type']} on {day} at {start_str} - {end_str}"
    
    return False, ""

@router.get("/schedule/time-slots/{course_id}", response_model=Dict[str, List[TimeSlotResponse]])
async def get_course_time_slots(
    course_id: str,
    user: TokenData = Depends(get_current_active_user),
):
    """Get all available time slots for a course, grouped by type"""
    # Check if user is enrolled in the course
    if user.role == "student":
        enrollment = await enrollments_collection.find_one({
            "student_id": str(user.user_id),
            "course_id": course_id,
            "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
        })
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be enrolled in this course to view its time slots"
            )
    
    # Get time slots for each type
    lecture_slots = await get_available_time_slots(course_id, TimeSlotType.LECTURE)
    lab_slots = await get_available_time_slots(course_id, TimeSlotType.LAB)
    tutorial_slots = await get_available_time_slots(course_id, TimeSlotType.TUTORIAL)
    
    # Get course details
    course = await courses_collection.find_one({"course_id": course_id})
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course {course_id} not found"
        )
        
    # Convert to response model
    lecture_responses = [
        TimeSlotResponse(
            slot_id=slot.slot_id,
            course_id=slot.course_id,
            course_name=course["name"],
            day=slot.day,
            start_time=slot.start_time,
            end_time=slot.end_time,
            type=slot.type,
            room_id=slot.room_id,
            room_name=slot.room_name,
            instructor_id=slot.instructor_id,
            instructor_name=slot.instructor_name
        )for slot in lecture_slots
    ]
    
    lab_responses = [
        TimeSlotResponse(
            slot_id=slot.slot_id,
            course_id=slot.course_id,
            course_name=course["name"],
            day=slot.day,
            start_time=slot.start_time,
            end_time=slot.end_time,
            type=slot.type,
            room_id=slot.room_id,
            room_name=slot.room_name,
            instructor_id=slot.instructor_id,
            instructor_name=slot.instructor_name
        ) for slot in lab_slots
    ]
    
    tutorial_responses = [
        TimeSlotResponse(
            slot_id=slot.slot_id,
            course_id=slot.course_id,
            course_name=course["name"],
            day=slot.day,
            start_time=slot.start_time,
            end_time=slot.end_time,
            type=slot.type,
            room_id=slot.room_id,
            room_name=slot.room_name,
            instructor_id=slot.instructor_id,
            instructor_name=slot.instructor_name
        ) for slot in tutorial_slots
    ]
    
    return {
        "lecture": lecture_responses,
        "lab": lab_responses,
        "tutorial": tutorial_responses
    }
    
@router.post("/schedule/select-time-slot", response_model=TimeSlotResponse)
async def select_time_slot(
    time_slot: TimeSlotCreate,
    user: TokenData = Depends(get_current_active_user)
):
    """Select a time slot for a course"""
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can select time slots"
        )
    
    student_id = str(user.user_id)
    
    # Check if student is enrolled in the course
    enrollment = await enrollments_collection.find_one({
        "student_id": student_id,
        "course_id": time_slot.course_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    })
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be enrolled in this course to select a time slot"
        )
    
    # Get time slot details
    slot = await time_slots_collection.find_one({"slot_id": time_slot.slot_id})
    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Time slot {time_slot.slot_id} not found"
        )
        
    # Check if the time slot is for the correct course
    if slot["course_id"] != time_slot.course_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Time slot does not match the specified course"
        )
        
    # Check if student already has a time slot for this course
    existing_slot = await schedules_collection.find_one({
        "student_id": student_id,
        "course_id": time_slot.course_id,
        "type": slot["type"]
    })
    
    if existing_slot:
        # Update existing slot
        await schedules_collection.update_one(
            {"_id": existing_slot["_id"]},
            {"$set": {
                "slot_id": slot["slot_id"],
                "day": slot["day"],
                "start_time": slot["start_time"],
                "end_time": slot["end_time"],
                "room_id": slot["room_id"],
                "instructor_id": slot.get("instructor_id"),
                "last_updated": datetime.now(timezone.utc)
            }}
        )
    else:
        # Check for time slot conflicts
        has_conflict, conflict_details = await check_schedule_conflicts(
            student_id,
            slot["day"],
            slot["start_time"],
            slot["end_time"]
        )
        
        if has_conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=conflict_details
            )
        
        # Add new slot to schedule
        await schedules_collection.insert_one({
            "student_id": student_id,
            "course_id": time_slot.course_id,
            "slot_id": slot["slot_id"],
            "type": slot["type"],
            "day": slot["day"],
            "start_time": slot["start_time"],
            "end_time": slot["end_time"],
            "room_id": slot["room_id"],
            "instructor_id": slot.get("instructor_id"),
            "created_at": datetime.now(timezone.utc),
            "last_updated": datetime.now(timezone.utc)
        })
        
    # Get course, room, and instructor details for response
    course = await courses_collection.find_one({"course_id": time_slot.course_id})
    room = await rooms_collection.find_one({"room_id": slot["room_id"]})
    room_name = f"{room['building']}-{room['room_number']}" if room else "Unknown"
    
    instructor = None
    instructor_name = None
    if slot.get("instructor_id"):
        instructor = await users_collection.find_one({"instructor_id": slot["instructor_id"]})
        instructor_name = instructor["name"] if instructor else None
    
    return TimeSlotResponse(
        slot_id=slot["slot_id"],
        course_id=time_slot.course_id,
        course_name=course["name"] if course else time_slot.course_id,
        day=slot["day"],
        start_time=slot["start_time"],
        end_time=slot["end_time"],
        type=slot["type"],
        room_id=slot["room_id"],
        room_name=room_name,
        instructor_id=slot.get("instructor_id"),
        instructor_name=instructor_name
    )
    
@router.delete("/schedule/delete-time-slot/{course_id}/{slot_type}")
async def remove_time_slot(
    course_id: str,
    slot_type: TimeSlotType,
    user: TokenData = Depends(get_current_active_user)
):
    """Remove a time slot from student's schedule"""
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can remove time slots"
        )
    
    student_id = str(user.user_id)
    
    # Check if student has this time slot
    result = await schedules_collection.delete_one({
        "student_id": student_id,
        "course_id": course_id,
        "type": slot_type
    })
    
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Time slot {slot_type} for course {course_id} not found in schedule"
        )
    
    return {"message": f"Successfully removed time slot {slot_type} for course {course_id}"}

@router.get("/schedule/", response_model=ScheduleResponse)
async def get_student_schedule(
    user: TokenData = Depends(get_current_active_user),
    semester: Optional[str] = None
):
    """Get the student's schedule"""
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can view their schedule"
        )
        
    student_id = str(user.user_id)
    
    # Get student's schedule
    schedule = await schedules_collection.find({
        "student_id": student_id
    }).to_list(None)
    
    # Get course details for all courses in schedule
    course_ids = list(set(slot["room_id"] for slot in schedule))
    courses = {}
    if course_ids:
        course_list = await courses_collection.find({
            "course_id": {"$in": course_ids}
        }).to_list(None)
        courses = {course["course_id"]: course["name"] for course in course_list}
    
    # Get room details for all rooms in schedule
    room_ids = list(set(slot["room_id"] for slot in schedule))
    rooms = {}
    if room_ids:
        room_list = await rooms_collection.find({"room_id": {"$in": room_ids}}).to_list(None)
        rooms = {room["room_id"]: room for room in room_list}
    # Get instructor details for all instructors in schedule
    instructor_ids = list(set(slot["instructor_id"] for slot in schedule if "instructor_id" in slot))
    instructors = {}
    if instructor_ids:
        instructor_list = await users_collection.find({"instructor_id": {"$in": instructor_ids}}).to_list(None)
        instructors = {instructor["instructor_id"]: instructor for instructor in instructor_list}
        
    # Organize schedule by day
    daily_schedule = {day: [] for day in DayOfWeek}
    
    for slot in schedule:
        course = courses.get(slot["course_id"], {})
        room = rooms.get(slot["room_id"], {})
        instructor = instructors.get(slot.get("instructor_id"), {})
        
        room_name = f"{room.get('building', '')}-{room.get('room_number', '')}" if room else 'Unknown'
        
        time_slot = TimeSlotResponse(
            slot_id=slot["slot_id"],
            course_id=slot["course_id"],
            course_name=course.get("name", slot["course_id"]),
            day=slot["day"],
            start_time=slot["start_time"],
            end_time=slot["end_time"],
            type=slot["type"],
            room_id=slot["room_id"],
            room_name=room_name,
            instructor_id=slot.get("instructor_id"),
            instructor_name=instructor.get("name") if instructor else None
        )
        
        daily_schedule[slot["day"]].append(time_slot)
        
    # Sort time slots by start time
    for day in daily_schedule:
        daily_schedule[day].sort(key=lambda x: time_to_minutes(x.start_time))
        
    # Calculate statistics
    total_courses = len(course_ids)
    total_credit_hours = sum(course.get("credit_hours", 0) for course in courses.values())
    
    # Calculate weekly class hours
    weekly_hours = 0
    for slot in schedule:
        start_mins = time_to_minutes(slot["start_time"])
        end_mins = time_to_minutes(slot["end_time"])
        weekly_hours += (end_mins - start_mins) / 60
        
    return ScheduleResponse(
        student_id=student_id,
        semester=semester or "Current",
        total_courses=total_courses,
        total_credit_hours=total_credit_hours,
        weekly_class_hours=weekly_hours,
        schedule=daily_schedule
    )
     
@router.get("/schedule/conflicts", response_model=List[ScheduleConflictResponse])
async def check_schedule_conflicts_endpoint(
    user: TokenData = Depends(get_current_active_user),
):
    """Check for conflicts in the student's schedule"""
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can check for schedule conflicts"
        )
        
    student_id = str(user.user_id)
    
    # Get student's current schedule
    schedule = await schedules_collection.find({
        "student_id": student_id
    }).to_list(None)
    
    # Group by day
    schedule_by_day = {}
    for slot in schedule:
        day = slot["day"]
        if day not in schedule_by_day:
            schedule_by_day[day] = []
        schedule_by_day[day].append(slot)
    
    # Check for conflicts
    conflicts = []
    
    for day, slots in schedule_by_day.items():
        # Sort by start time
        slot.sort(key=lambda x: time_to_minutes(x["start_time"]))
        
        # Check each pair of slots
        for i in range(len(slots)):
            for j in range(i + 1, len(slots)):
                slot1 = slots[i]
                slot2 = slots[j]
                
                if check_time_overlap(
                    slot1["start_time"], slot1["end_time"],
                    slot2["start_time"], slot2["end_time"]
                ):
                    # Get course details
                    course1 = await courses_collection.find_one({"course_id": slot1["course_id"]})
                    course2 = await courses_collection.find_one({"course_id": slot2["course_id"]})
                    
                    conflicts.append(ScheduleConflictResponse(
                        day=day,
                        course1_id=slot1["course_id"],
                        course1_name=course1["name"] if course1 else slot1["course_id"],
                        course1_type=slot1["type"],
                        course1_time=f"{slot1['start_time'].strftime('%H:%M')} - {slot1['end_time'].strftime('%H:%M')}",
                        course2_id=slot2["course_id"],
                        course2_name=course2["name"] if course2 else slot2["course_id"],
                        course2_type=slot2["type"],
                        course2_time=f"{slot2['start_time'].strftime('%H:%M')} - {slot2['end_time'].strftime('%H:%M')}"
                    ))
                    
    return conflicts

@router.get("/schedule/recommendations", response_model=Dict[str, Dict[str, List[TimeSlotResponse]]])
async def get_schedule_recommendations(
    user: TokenData = Depends(get_current_active_user)
):
    """Get recommended time slots for courses that don't have time slots selected yet"""
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can get schedule recommendations"
        )
        
    student_id = str(user.user_id)
    
    # Get student's enrollments
    enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    }).to_list(None)
    
    # Get student's current schedule
    schedule = await schedules_collection.find({
        "student_id": student_id
    }).to_list(None)
    
    # Find courses that need time slots
    scheduled_courses = {
        (slot["course_id"], slot["type"]) 
        for slot in schedule
    }
    
    recommendations = {}
    
    for enrollment in enrollments:
        course_id = enrollment["course_id"]
        course = await courses_collection.find_one({"course_id": course_id})
        
        if not course:
            continue
        
        # Check which slot types are needed
        needed_types = []
        
        # Most courses need a lecture
        if (course_id, TimeSlotType.LECTURE) not in scheduled_courses:
            needed_types.append(TimeSlotType.LECTURE)
        
        # Check if course has lab or tutorial requirements
        has_lab = await time_slots_collection.find_one({
            "course_id": course_id,
            "type": TimeSlotType.LAB
        })
        
        has_tutorial = await time_slots_collection.find_one({
            "course_id": course_id,
            "type": TimeSlotType.TUTORIAL
        })
        
        if has_lab and (course_id, TimeSlotType.LAB) not in scheduled_courses:
            needed_types.append(TimeSlotType.LAB)
        
        if has_tutorial and (course_id, TimeSlotType.TUTORIAL) not in scheduled_courses:
            needed_types.append(TimeSlotType.TUTORIAL)
        
        # If no slots needed, skip this course
        if not needed_types:
            continue
        
        # Get available time slots for each needed type
        course_recommendations = {}
        
        for slot_type in needed_types:
            available_slots = await get_available_time_slots(course_id, slot_type)
            
            # Filter out slots that conflict with existing schedule
            non_conflicting_slots = []
            
            for slot in available_slots:
                has_conflict = False
                
                for scheduled_slot in schedule:
                    if (scheduled_slot["day"] == slot.day and 
                        check_time_overlap(
                            scheduled_slot["start_time"], scheduled_slot["end_time"],
                            slot.start_time, slot.end_time
                        )):
                        has_conflict = True
                        break
                
                if not has_conflict:
                    non_conflicting_slots.append(TimeSlotResponse(
                        slot_id=slot.slot_id,
                        course_id=slot.course_id,
                        course_name=course["name"],
                        day=slot.day,
                        start_time=slot.start_time,
                        end_time=slot.end_time,
                        type=slot.type,
                        room_id=slot.room_id,
                        room_name=slot.room_name,
                        instructor_id=slot.instructor_id,
                        instructor_name=slot.instructor_name
                    ))
            
            if non_conflicting_slots:
                course_recommendations[slot_type] = non_conflicting_slots
        
        if course_recommendations:
            recommendations[course_id] = course_recommendations
    
    return recommendations

@router.get("/admin/time-slots", response_model=List[Dict[str, Any]])
async def get_all_time_slots(
    user: TokenData = Depends(get_current_active_user),
    course_id: Optional[str] = None
):
    """Get all time slots (admin only)"""
    if user.role != "admin" and user.role != "instructor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and instructors can view all time slots"
        )
    
    # Build query
    query = {}
    if course_id:
        query["course_id"] = course_id
    
    # Get time slots
    time_slots = await time_slots_collection.find(query).to_list(None)
    
    # Get course, room, and instructor details
    result = []
    for slot in time_slots:
        course = await courses_collection.find_one({"course_id": slot["course_id"]})
        room = await rooms_collection.find_one({"room_id": slot["room_id"]})
        instructor = None
        if slot.get("instructor_id"):
            instructor = await users_collection.find_one({"instructor_id": slot["instructor_id"]})
        
        result.append({
            "slot_id": slot["slot_id"],
            "course_id": slot["course_id"],
            "course_name": course["name"] if course else "Unknown",
            "day": slot["day"],
            "start_time": slot["start_time"].strftime("%H:%M"),
            "end_time": slot["end_time"].strftime("%H:%M"),
            "type": slot["type"],
            "room_id": slot["room_id"],
            "room_name": f"{room['building']}-{room['room_number']}" if room else "Unknown",
            "instructor_id": slot.get("instructor_id"),
            "instructor_name": instructor["name"] if instructor else None
        })
    
    return result

@router.get("/admin/student-schedules", response_model=List[Dict[str, Any]])
async def get_all_student_schedules(
    user: TokenData = Depends(get_current_active_user),
    student_id: Optional[str] = None
):
    """Get all student schedules (admin only)"""
    if user.role != "admin" and user.role != "instructor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and instructors can view all student schedules"
        )
    
    # Build query
    query = {}
    if student_id:
        query["student_id"] = student_id
    
    # Get schedules
    schedules = await schedules_collection.find(query).to_list(None)
    
    # Get student, course, room, and instructor details
    result = []
    for schedule in schedules:
        student = await users_collection.find_one({"student_id": schedule["student_id"]})
        course = await courses_collection.find_one({"course_id": schedule["course_id"]})
        room = await rooms_collection.find_one({"room_id": schedule["room_id"]})
        instructor = None
        if schedule.get("instructor_id"):
            instructor = await users_collection.find_one({"instructor_id": schedule["instructor_id"]})
        
        result.append({
            "student_id": schedule["student_id"],
            "student_name": student["name"] if student else "Unknown",
            "course_id": schedule["course_id"],
            "course_name": course["name"] if course else "Unknown",
            "day": schedule["day"],
            "start_time": schedule["start_time"].strftime("%H:%M"),
            "end_time": schedule["end_time"].strftime("%H:%M"),
            "type": schedule["type"],
            "room_id": schedule["room_id"],
            "room_name": f"{room['building']}-{room['room_number']}" if room else "Unknown",
            "instructor_id": schedule.get("instructor_id"),
            "instructor_name": instructor["name"] if instructor else None
        })
    
    return result

@router.get("/schedule/course/{course_id}", response_model=List[TimeSlotResponse])
async def get_course_schedule(
    course_id: str,
    user: TokenData = Depends(get_current_active_user)
):
    """Get all scheduled time slots for a specific course"""
    # Check if user is enrolled in the course or is admin/instructor
    if user.role == "student":
        enrollment = await enrollments_collection.find_one({
            "student_id": str(user.user_id),
            "course_id": course_id,
            "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
        })
        
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be enrolled in this course to view its schedule"
            )
    
    # Get course details
    course = await courses_collection.find_one({"course_id": course_id})
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course {course_id} not found"
        )
    
    # Get all time slots for this course
    time_slots = await time_slots_collection.find({
        "course_id": course_id
    }).to_list(None)
    
    # Get room and instructor details
    result = []
    for slot in time_slots:
        room = await rooms_collection.find_one({"room_id": slot["room_id"]})
        room_name = f"{room['building']}-{room['room_number']}" if room else "Unknown"
        
        instructor = None
        instructor_name = None
        if slot.get("instructor_id"):
            instructor = await users_collection.find_one({"instructor_id": slot["instructor_id"]})
            instructor_name = instructor["name"] if instructor else None
        
        result.append(TimeSlotResponse(
            slot_id=slot["slot_id"],
            course_id=course_id,
            course_name=course["name"],
            day=slot["day"],
            start_time=slot["start_time"],
            end_time=slot["end_time"],
            type=slot["type"],
            room_id=slot["room_id"],
            room_name=room_name,
            instructor_id=slot.get("instructor_id"),
            instructor_name=instructor_name
        ))
    
    return result

@router.get("/schedule/time-slots-with-seats/{course_id}")
async def get_time_slots_with_seats(
    course_id: str,
    user: TokenData = Depends(get_current_active_user)
):
    """Get all time slots for a course with the number of available seats"""
    try:
        # Check permission - students must be enrolled
        if user.role == "student":
            enrollment = await enrollments_collection.find_one({
                "student_id": str(user.user_id),
                "course_id": course_id,
                "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
            })
            if not enrollment:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You must be enrolled in this course to view its time slots"
                )
        
        # Get the course information
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course {course_id} not found"
            )
        
        # Check cache first
        cache_key = f"time_slots_seats_{course_id}"
        if (cache_key in SEAT_COUNT_CACHE["data"] and 
            cache_key in SEAT_COUNT_CACHE["timestamp"] and
            time_module.time() - SEAT_COUNT_CACHE["timestamp"][cache_key] < SEAT_COUNT_CACHE["ttl"]):
            return SEAT_COUNT_CACHE["data"][cache_key]
        
        # Get all time slots for this course
        time_slots = await time_slots_collection.find({"course_id": course_id}).to_list(None)
        
        # Get the room capacities
        room_ids = list(set(slot["room_id"] for slot in time_slots if "room_id" in slot))
        rooms = {
            room["room_id"]: room 
            for room in await rooms_collection.find({"room_id": {"$in": room_ids}}).to_list(None)
        }
        
        # Get the enrollment counts for each time slot
        # Count how many students have selected each time slot
        slot_ids = [slot["slot_id"] for slot in time_slots]
        enrolled_counts = {}
        
        for slot_id in slot_ids:
            count = await schedules_collection.count_documents({"selected_slots": slot_id})
            enrolled_counts[slot_id] = count
        
        # Prepare the response
        time_slots_with_seats = []
        
        for slot in time_slots:
            # Get room capacity
            room = rooms.get(slot.get("room_id"))
            room_capacity = room.get("capacity", 0) if room else 0
            
            # Get room details
            room_name = f"{room.get('building', '')}-{room.get('room_number', '')}" if room else "Unknown"
            
            # Get instructor details
            instructor = None
            instructor_name = None
            if slot.get("instructor_id"):
                instructor = await users_collection.find_one({"instructor_id": slot["instructor_id"]})
                instructor_name = instructor.get("name") if instructor else None
            
            # Calculate seats available
            enrolled_count = enrolled_counts.get(slot["slot_id"], 0)
            seats_available = max(0, room_capacity - enrolled_count)
            
            # Format times for display
            start_time = slot["start_time"]
            end_time = slot["end_time"]
            if isinstance(start_time, str):
                start_time_parts = start_time.split(":")
                start_time = f"{start_time_parts[0]}:{start_time_parts[1]}"
            if isinstance(end_time, str):
                end_time_parts = end_time.split(":")
                end_time = f"{end_time_parts[0]}:{end_time_parts[1]}"
            
            # Add to results
            time_slots_with_seats.append({
                "slot_id": slot["slot_id"],
                "course_id": slot["course_id"],
                "course_name": course.get("name", "Unknown Course"),
                "day": slot["day"],
                "start_time": start_time,
                "end_time": end_time,
                "type": slot["type"],
                "room_id": slot["room_id"],
                "room_name": room_name,
                "instructor_id": slot.get("instructor_id"),
                "instructor_name": instructor_name,
                "room_capacity": room_capacity,
                "enrolled_count": enrolled_count,
                "seats_available": seats_available
            })
        
        # Group by type for easier consumption by the frontend
        result = {
            "lecture": [],
            "lab": [],
            "tutorial": []
        }
        
        for slot in time_slots_with_seats:
            slot_type = slot["type"].lower()
            if slot_type in result:
                result[slot_type].append(slot)
        
        # Add course information
        result["course_id"] = course_id
        result["course_name"] = course.get("name", "Unknown Course")
        result["course_code"] = course.get("code", course_id)
        
        # Update cache
        SEAT_COUNT_CACHE["data"][cache_key] = result
        SEAT_COUNT_CACHE["timestamp"][cache_key] = time_module.time()
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving time slots with seats: {str(e)}"
        )