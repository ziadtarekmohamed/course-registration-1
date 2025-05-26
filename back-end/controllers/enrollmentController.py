from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from models.Enrollments import (
    EnrollmentCreate,
    Enrollment,
    EnrollmentResponse,
    EnrollmentStatus,
    CourseAvailabilityResponse
)
from database import (
    enrollments_collection,
    students_collection,
    courses_collection,
    users_collection,
    departments_collection,
    semester_settings_collection
)
from helpers.auth import get_current_user, TokenData
from helpers.exceptions import EnrollmentError
from models.SemesterSettings import SemesterType
import time
import functools
from pymongo import UpdateOne

router = APIRouter()

WITHDRAWAL_DEADLINE_DAYS = 14
SETTINGS_ID = "semester_settings"  # Same as in semesterController

# Simple in-memory cache for course tree data
COURSE_TREE_CACHE = {
    "data": None,
    "timestamp": None,
    "ttl": 300  # Cache TTL in seconds (5 minutes)
}

# Simple in-memory cache for student enrollments
ENROLLMENTS_CACHE = {}

# Cache decorator for expensive operations
def timed_cache(ttl_seconds=300):
    def decorator(func):
        cache = {}
        
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Create a key based on function arguments
            key = str(args) + str(kwargs)
            
            # Check if result is cached and not expired
            if key in cache:
                result, timestamp = cache[key]
                if time.time() - timestamp < ttl_seconds:
                    print(f"✅ Cache hit for {func.__name__}")
                    return result
            
            # Call the original function
            print(f"❌ Cache miss for {func.__name__}")
            start_time = time.time()
            result = await func(*args, **kwargs)
            execution_time = time.time() - start_time
            print(f"⏱️ {func.__name__} execution time: {execution_time:.2f}s")
            
            # Cache the result
            cache[key] = (result, time.time())
            
            return result
        
        # Add a method to clear the cache
        wrapper.clear_cache = lambda: cache.clear()
        
        return wrapper
    return decorator

async def get_current_semester() -> SemesterType:
    """Helper function to get the current semester"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings:
        # If no settings exist, default to Fall
        return SemesterType.FALL
    
    return settings.get("current_semester", SemesterType.FALL)

@timed_cache(ttl_seconds=300)
async def validate_prerequisites(student_id: str, course_id: str) -> tuple[bool, str]:
    """
    Check if student has completed all prerequisites for a course
    Returns: (prerequisites_met, error_message)
    """
    course = await courses_collection.find_one({"course_id": course_id})
    if not course or not course.get("prerequisites"):
        return True, ""
    
    # Get student's completed courses
    completed_courses = await enrollments_collection.find({
        "student_id": student_id,
        "status": EnrollmentStatus.COMPLETED
    }).to_list(None)
    
    completed_course_ids = {enrollment["course_id"] for enrollment in completed_courses}
    missing_prerequisites = [
        prereq for prereq in course["prerequisites"]
        if prereq not in completed_course_ids
    ]
    
    if missing_prerequisites:
        # Get course names for better error message
        prereq_courses = await courses_collection.find(
            {"course_id": {"$in": missing_prerequisites}}
        ).to_list(None)
        prereq_names = [f"{c['course_id']} ({c['name']})" for c in prereq_courses]
        return False, f"Missing prerequisites: {', '.join(prereq_names)}"
    
    return True, ""

async def validate_enrollment(student_id: str, course_id: str):
    """Validate enrollment requirements"""
    # Check if student exists
    student = await users_collection.find_one({"student_id": student_id.strip()})
    if not student:
        raise EnrollmentError("Student not found")
    
    # Check if course exists
    course = await courses_collection.find_one({"course_id": course_id})
    if not course:
        raise EnrollmentError("Course not found")
    
    # Check prerequisites
    prereqs_met, error_message = await validate_prerequisites(student_id, course_id)
    if not prereqs_met:
        raise EnrollmentError(error_message)
    
    # Check credit hours
    if student["credit_hours"] < course["credit_hours"]:
        raise EnrollmentError(
            f"Insufficient credit hours. Required: {course['credit_hours']}, Available: {student['credit_hours']}"
        )
    
    # Check existing enrollment
    existing = await enrollments_collection.find_one({
        "student_id": student_id,
        "course_id": course_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    })
    if existing:
        raise EnrollmentError("Already enrolled in this course")
    
    # Check if course is offered in current semester
    current_semester = await get_current_semester()
    if not course.get("semesters") or current_semester not in course.get("semesters", []):
        raise EnrollmentError(f"Course not offered in the current {current_semester} semester")
    
    return student, course

@timed_cache(ttl_seconds=600)  # Cache for 10 minutes
async def get_course_tree_flattened():
    """
    Get a flattened list of all courses in the course tree
    Returns: Set of course_ids present in the course tree
    """
    # Check if data is in cache
    if COURSE_TREE_CACHE["data"] and COURSE_TREE_CACHE["timestamp"]:
        if time.time() - COURSE_TREE_CACHE["timestamp"] < COURSE_TREE_CACHE["ttl"]:
            print("✅ Using cached course tree data")
            return COURSE_TREE_CACHE["data"]
    
    print("❌ Course tree cache miss, fetching from database")
    start_time = time.time()
    
    try:
        # Build query to get all courses in the tree
        query = {}
        
        # Get all courses based on query
        courses = await courses_collection.find(query).to_list(1000)
        
        # Create a dictionary to store all courses by their ID for easy lookup
        course_dict = {course["course_id"]: course for course in courses}
        
        # Build the tree structure
        root_nodes = []
        processed_courses = set()
        
        # First pass: identify root nodes (courses without prerequisites)
        for course_id, course in course_dict.items():
            # If course has no prerequisites or prerequisites are empty, it's a root node
            if not course.get("prerequisites") or len(course["prerequisites"]) == 0:
                root_data = {
                    "course_id": course["course_id"],
                    "name": course["name"],
                    "children": [],
                }
                root_nodes.append(root_data)
                processed_courses.add(course_id)
        
        # Function to recursively build the tree
        def build_children(parent_id):
            children = []
            for course_id, course in course_dict.items():
                if course_id not in processed_courses and course.get("prerequisites") and parent_id in course["prerequisites"]:
                    child_data = {
                        "course_id": course["course_id"],
                        "name": course["name"],
                        "children": [],
                    }
                    processed_courses.add(course_id)
                    child_data["children"] = build_children(course_id)
                    children.append(child_data)
            return children
        
        # Build the tree for each root node
        for root in root_nodes:
            root["children"] = build_children(root["course_id"])
        
        # Extract all course IDs from the tree
        all_tree_courses = set()
        
        def extract_course_ids(nodes):
            course_ids = set()
            for node in nodes:
                course_ids.add(node["course_id"])
                if node.get("children"):
                    course_ids.update(extract_course_ids(node["children"]))
            return course_ids
        
        all_tree_courses = extract_course_ids(root_nodes)
        
        # Add any courses not yet processed (might be isolated nodes)
        for course_id in course_dict:
            all_tree_courses.add(course_id)
        
        # Update cache
        COURSE_TREE_CACHE["data"] = all_tree_courses
        COURSE_TREE_CACHE["timestamp"] = time.time()
        
        end_time = time.time()
        print(f"⏱️ Course tree generation time: {end_time - start_time:.2f}s")
        
        return all_tree_courses
        
    except Exception as e:
        print(f"Error getting course tree: {str(e)}")
        return set()  # Return empty set on error

@router.get("/courses/available", response_model=List[CourseAvailabilityResponse])
async def get_available_courses(
    user: TokenData = Depends(get_current_user),
    semester: Optional[str] = None  # Optional parameter to override current semester
):
    """
    Get all courses available for enrollment for the current student,
    checking prerequisites and existing enrollments.
    Only courses that are in the course tree and offered in the current semester will be returned.
    """
    if user.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can view available courses"
        )
    
    student_id = str(user.user_id)
    
    # Get current semester if not specified
    current_semester = semester or await get_current_semester()
    
    # Get all courses in the course tree
    course_tree_ids = await get_course_tree_flattened()
    
    # Get all courses that are in the course tree and offered in the current semester
    courses = await courses_collection.find(
        {
            "course_id": {"$in": list(course_tree_ids)},
            "semesters": current_semester
        }
    ).to_list(None)
    
    # Get student's completed and current courses
    student_enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    }).to_list(None)
    
    enrolled_courses = {e["course_id"] for e in student_enrollments}
    completed_courses = {
        e["course_id"] for e in student_enrollments 
        if e["status"] == EnrollmentStatus.COMPLETED
    }
    
    # Check each course
    available_courses = []
    for course in courses:
        # Get department name
        department = await departments_collection.find_one(
            {"department_id": course.get("department_id")}
        )
        department_name = department["name"] if department else "Unknown"
        
        # Default response
        course_response = CourseAvailabilityResponse(
            course_id=course["course_id"],
            name=course["name"],
            description=course.get("description", ""),
            credit_hours=course["credit_hours"],
            department_name=department_name,
            prerequisites=course.get("prerequisites", []),
            can_enroll=True,
            reason=None
        )
        
        # Check if already enrolled
        if course["course_id"] in enrolled_courses:
            course_response.can_enroll = False
            course_response.reason = "Already enrolled"
            available_courses.append(course_response)
            continue
        
        # Check prerequisites
        if course.get("prerequisites"):
            missing_prereqs = [
                prereq for prereq in course["prerequisites"]
                if prereq not in completed_courses
            ]
            if missing_prereqs:
                course_response.can_enroll = False
                course_response.reason = f"Missing prerequisites: {', '.join(missing_prereqs)}"
                available_courses.append(course_response)
                continue
        
        available_courses.append(course_response)
    
    return available_courses

async def check_registration_allowed():
    """Check if registration is currently allowed"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings or "registration_periods" not in settings:
        return False, "Registration period not configured"
    
    reg_periods = settings["registration_periods"]
    current_time = datetime.now(timezone.utc)
    
    # Check if registration is enabled
    registration_enabled = reg_periods.get("registration_enabled", False)
    if not registration_enabled:
        return False, "Course registration is currently disabled"
    
    # Check if within valid time period
    if reg_periods.get("registration_start_date") and reg_periods.get("registration_end_date"):
        start_date = reg_periods["registration_start_date"]
        end_date = reg_periods["registration_end_date"]
        
        # If dates are strings, convert them to datetime objects
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if current_time < start_date:
            return False, f"Course registration period starts on {start_date.isoformat()}"
        if current_time > end_date:
            return False, f"Course registration period ended on {end_date.isoformat()}"
    
    return True, "Registration allowed"

async def check_withdrawal_allowed():
    """Check if withdrawal is currently allowed"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings or "registration_periods" not in settings:
        return False, "Withdrawal period not configured"
    
    reg_periods = settings["registration_periods"]
    current_time = datetime.now(timezone.utc)
    
    # Check if withdrawal is enabled
    withdrawal_enabled = reg_periods.get("withdrawal_enabled", False)
    if not withdrawal_enabled:
        return False, "Course withdrawal is currently disabled"
    
    # Check if within valid time period
    if reg_periods.get("withdrawal_start_date") and reg_periods.get("withdrawal_end_date"):
        start_date = reg_periods["withdrawal_start_date"]
        end_date = reg_periods["withdrawal_end_date"]
        
        # If dates are strings, convert them to datetime objects
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        if current_time < start_date:
            return False, f"Course withdrawal period starts on {start_date.isoformat()}"
        if current_time > end_date:
            return False, f"Course withdrawal period ended on {end_date.isoformat()}"
    
    return True, "Withdrawal allowed"

@router.post("/enrollments/", response_model=EnrollmentResponse)
async def register_course(
    enrollment: EnrollmentCreate,
    user: TokenData = Depends(get_current_user)
):
    """Register a student for a course"""
    try:
        # Verify student authorization
        if user.role not in ["student", "instructor"]:
            raise HTTPException(
                status_code=403,
                detail="Only students can register for courses"
            )
        
        if str(user.user_id) != str(enrollment.student_id):
            raise HTTPException(
                status_code=403,
                detail="Unauthorized to register for this student ID"
            )
        
        # Check if registration is allowed
        registration_allowed, message = await check_registration_allowed()
        if not registration_allowed and user.role != "admin":  # Allow admins to bypass this check
            raise HTTPException(
                status_code=403,
                detail=message
            )
        
        # Verify course is in the course tree
        course_tree_ids = await get_course_tree_flattened()
        if enrollment.course_id not in course_tree_ids:
            raise HTTPException(
                status_code=400,
                detail="Course is not available for enrollment"
            )
        
        enrollment_student_id = str(enrollment.student_id)
        # Validate enrollment requirements
        student, course = await validate_enrollment(
            enrollment_student_id,
            enrollment.course_id
        )
        
        # Create enrollment record
        now = datetime.now(timezone.utc)
        enrollment_data = Enrollment(
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            registered_at=now,
            status=EnrollmentStatus.PENDING,
            created_at=now,
            last_updated=now
        ).model_dump()
        
        # Insert enrollment
        await enrollments_collection.insert_one(enrollment_data)
        
        # Update student's credit hours
        await students_collection.update_one(
            {"student_id": student["student_id"]},
            {"$inc": {"credit_hours": -course["credit_hours"]}}
        )
        
        # Get department name for response
        department = await departments_collection.find_one(
            {"department_id": course.get("department_id")}
        )
        
        # Prepare response
        return EnrollmentResponse(
            student_id=enrollment.student_id,
            course_id=enrollment.course_id,
            course_name=course["name"],
            credit_hours=course["credit_hours"],
            status=EnrollmentStatus.PENDING,
            registered_at=now
        )
        
    except EnrollmentError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/enrollments/{course_id}")
async def withdraw_course(
    course_id: str,
    user: TokenData = Depends(get_current_user)
):
    """
    Withdraw from a course

    Args:
        course_id (str): CourseID to withdraw from
        user (TokenData, optional): Current authenticated user
        
    Returns:
        dict: Success message
        
    Raises:
        HTTPException: for various validation errors
    """
    try:
        if user.role != "student":
            raise HTTPException(
                status_code=403,
                detail="Only students can withdraw from courses"
            )
        
        student_id = str(user.user_id)
        
        # Check if withdrawal is allowed
        withdrawal_allowed, message = await check_withdrawal_allowed()
        if not withdrawal_allowed and user.role != "admin":  # Allow admins to bypass this check
            raise HTTPException(
                status_code=403,
                detail=message
            )
        
        # Check enrollment exists
        enrollment = await enrollments_collection.find_one({
            "student_id": student_id,
            "course_id": course_id
        })
        if not enrollment:
            raise HTTPException(
                status_code=404,
                detail="Enrollment not found"
            )
        
        # Check withdrawal deadline - Fix timezone issue
        registered_at = enrollment["registered_at"]
        # Ensure registered_at has timezone info
        if registered_at.tzinfo is None:
            # If naive, assume it's UTC and make it timezone-aware
            registered_at = registered_at.replace(tzinfo=timezone.utc)
            
        if (datetime.now(timezone.utc) - registered_at >
            timedelta(days=WITHDRAWAL_DEADLINE_DAYS)):
            raise HTTPException(
                status_code=400,
                detail="Withdrawal deadline has passed"
            )
            
        # Get course details
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(
                status_code=404,
                detail="Course not found"
            )

        # Process withdrawal
        try:
            async with await enrollments_collection.database.client.start_session() as session:
                async with session.start_transaction():
                    # Update enrollment status
                    await enrollments_collection.update_one(
                        {"student_id": student_id, "course_id": course_id},
                        {"$set": {
                            "status": EnrollmentStatus.WITHDRAWN,
                            "last_updated": datetime.now(timezone.utc)
                        }},
                        session=session
                    )
            
                    # Restore credit hours
                    await students_collection.update_one(
                        {"student_id": student_id},
                        {"$inc": {"credit_hours": course["credit_hours"]}},
                        session=session
                    )
        except AttributeError:
            # If start_session is not available, fall back to non-transactional updates
            # Update enrollment status
            await enrollments_collection.update_one(
                {"student_id": student_id, "course_id": course_id},
                {"$set": {
                    "status": EnrollmentStatus.WITHDRAWN,
                    "last_updated": datetime.now(timezone.utc)
                }}
            )
        
            # Restore credit hours
            await students_collection.update_one(
                {"student_id": student_id},
                {"$inc": {"credit_hours": course["credit_hours"]}}
            )
            
        return {
            "message": f"Successfully withdrawn from {course_id}",
            "status": EnrollmentStatus.WITHDRAWN
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/enrollments/student/{student_id}", response_model=List[EnrollmentResponse])
async def get_student_enrollments(
    student_id: str,
    user: TokenData = Depends(get_current_user)
):
    """Get all enrollments for a student"""
    # Cache key includes student ID
    cache_key = f"enrollments_{student_id}"
    
    # Check permission
    if user.role not in ["student", "instructor", "admin"] or (
        user.role == "student" and str(user.user_id) != str(student_id)
    ):
        raise HTTPException(
            status_code=403,
            detail="Unauthorized access to view these enrollments"
        )
    
    # Check cache first
    if cache_key in ENROLLMENTS_CACHE:
        cache_entry = ENROLLMENTS_CACHE[cache_key]
        # Check if cache is still valid (5 minutes TTL)
        if time.time() - cache_entry["timestamp"] < 300:
            print(f"✅ Cache hit for student enrollments: {student_id}")
            return cache_entry["data"]
    
    print(f"❌ Cache miss for student enrollments: {student_id}")
    start_time = time.time()
    
    # Get all courses in the course tree (itself cached)
    course_tree_ids = await get_course_tree_flattened()
    
    # Get enrollments with a single query
    enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "course_id": {"$in": list(course_tree_ids)}
    }).to_list(None)
    
    # Get all course IDs from enrollments
    course_ids = [enrollment["course_id"] for enrollment in enrollments]
    
    # Fetch all courses in one batch
    courses_data = {}
    if course_ids:
        courses = await courses_collection.find({"course_id": {"$in": course_ids}}).to_list(None)
        courses_data = {course["course_id"]: course for course in courses}
    
    # Build responses
    response_enrollments = []
    for enrollment in enrollments:
        course_id = enrollment["course_id"]
        if course_id in courses_data:
            course = courses_data[course_id]
            response_enrollments.append(
                EnrollmentResponse(
                    student_id=enrollment["student_id"],
                    course_id=course_id,
                    course_name=course["name"],
                    credit_hours=course["credit_hours"],
                    status=enrollment["status"],
                    registered_at=enrollment["registered_at"]
                )
            )
    
    end_time = time.time()
    print(f"⏱️ Enrollments fetch time: {end_time - start_time:.2f}s")
    
    # Cache the results
    ENROLLMENTS_CACHE[cache_key] = {
        "data": response_enrollments,
        "timestamp": time.time()
    }
    
    return response_enrollments

@router.get("/courses/tree/available")
async def get_available_course_tree(
    user: TokenData = Depends(get_current_user),
    semester: Optional[str] = None  # Optional parameter to override current semester
):
    """
    Get available courses structured as a tree,
    showing prerequisites and subsequent courses.
    Only returns courses that the student can enroll in for the current semester.
    """
    if user.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can view available courses"
        )
    
    student_id = str(user.user_id)
    
    # Cache key combines student ID and semester
    current_semester = semester or await get_current_semester()
    cache_key = f"course_tree_{student_id}_{current_semester}"
    
    # Check cache
    if cache_key in ENROLLMENTS_CACHE:
        cache_entry = ENROLLMENTS_CACHE[cache_key]
        # Check if cache is still valid (2 minutes TTL)
        if time.time() - cache_entry["timestamp"] < 120:
            print(f"✅ Cache hit for available course tree: {student_id}")
            return cache_entry["data"]
    
    print(f"❌ Cache miss for available course tree: {student_id}")
    start_time = time.time()
    
    # OPTIMIZATION 1: Use batch queries to get all data upfront
    
    # Get student's enrollments in one query
    student_enrollments = await enrollments_collection.find({
        "student_id": student_id,
        "status": {"$in": [EnrollmentStatus.PENDING, EnrollmentStatus.COMPLETED]}
    }).to_list(None)
    
    # Process enrollment data
    enrolled_courses = {e["course_id"] for e in student_enrollments}
    completed_courses = {
        e["course_id"] for e in student_enrollments 
        if e["status"] == EnrollmentStatus.COMPLETED
    }
    
    # Get all courses in the course tree
    course_tree_ids = await get_course_tree_flattened()
    
    # OPTIMIZATION 2: Use a more targeted query with all filters applied at once
    query = {
        "course_id": {"$in": list(course_tree_ids)},
        "semesters": current_semester
    }
    
    # Get all courses based on query
    courses = await courses_collection.find(query).to_list(1000)
    
    # Create a dictionary to store all courses by their ID for easy lookup
    course_dict = {course["course_id"]: course for course in courses}
    
    # OPTIMIZATION 3: Get all department data in one query
    department_ids = list({course.get("department_id") for course in courses if course.get("department_id")})
    departments = {}
    
    if department_ids:
        dept_results = await departments_collection.find(
            {"department_id": {"$in": department_ids}},
            {"name": 1, "department_id": 1, "_id": 0}
        ).to_list(None)
        
        departments = {dept["department_id"]: dept["name"] for dept in dept_results}
    
    # OPTIMIZATION 4: Process courses in one pass with all data available
    processed_courses = {}
    
    for course_id, course in course_dict.items():
        dept_id = course.get("department_id", "")
        
        processed_course = {
            "course_id": course_id,
            "name": course["name"],
            "department_id": dept_id,
            "department_name": departments.get(dept_id, "Unknown"),
            "credit_hours": course["credit_hours"],
            "description": course.get("description", ""),
            "children": [],
            "semesters": course.get("semesters", []),
            "current_semester": current_semester
        }
        
        # Check enrollment status
        if course_id in enrolled_courses:
            processed_course["can_enroll"] = False
            processed_course["enrollment_status"] = "enrolled"
        elif course_id in completed_courses:
            processed_course["can_enroll"] = False
            processed_course["enrollment_status"] = "completed"
        else:
            # Check prerequisites
            if course.get("prerequisites"):
                missing_prereqs = [
                    prereq for prereq in course["prerequisites"]
                    if prereq not in completed_courses
                ]
                if missing_prereqs:
                    processed_course["can_enroll"] = False
                    processed_course["enrollment_status"] = "prerequisites_missing"
                else:
                    processed_course["can_enroll"] = True
                    processed_course["enrollment_status"] = "available"
            else:
                processed_course["can_enroll"] = True
                processed_course["enrollment_status"] = "available"
        
        processed_courses[course_id] = processed_course
    
    # OPTIMIZATION 5: Build tree structure more efficiently
    root_nodes = []
    processed_course_ids = set()
    
    # First pass: identify root nodes (courses without prerequisites)
    for course_id, course in course_dict.items():
        if course_id not in processed_course_ids and (not course.get("prerequisites") or len(course["prerequisites"]) == 0):
            root_nodes.append(processed_courses[course_id])
            processed_course_ids.add(course_id)
    
    # Second pass: build children for each root
    for root in root_nodes:
        def build_children(parent_id):
            children = []
            for course_id, course in course_dict.items():
                if (course_id not in processed_course_ids and 
                    course.get("prerequisites") and 
                    parent_id in course["prerequisites"]):
                    
                    child = processed_courses[course_id]
                    processed_course_ids.add(course_id)
                    child["children"] = build_children(course_id)
                    if "prerequisites" not in child and course.get("prerequisites"):
                        child["prerequisites"] = course["prerequisites"]
                    children.append(child)
            return children
        
        root["children"] = build_children(root["course_id"])
    
    # Group by department (these are root nodes)
    departments_dict = {}
    
    for course in root_nodes:
        dept_id = course["department_id"]
        dept_name = course["department_name"]
        
        if dept_id not in departments_dict:
            departments_dict[dept_id] = {
                "department_id": dept_id,
                "department_name": dept_name,
                "courses": [],
                "current_semester": current_semester
            }
        
        departments_dict[dept_id]["courses"].append(course)
    
    # Convert to list for response
    result = list(departments_dict.values())
    
    end_time = time.time()
    print(f"⏱️ Available course tree generation time: {end_time - start_time:.2f}s")
    
    # Cache the results
    ENROLLMENTS_CACHE[cache_key] = {
        "data": result,
        "timestamp": time.time()
    }
    
    return result

