from fastapi import APIRouter, HTTPException, Depends
from database import (
    courses_collection, 
    enrollments_collection, 
    students_collection, 
    schedules_collection,
    departments_collection
)
from models.Courses import Course, CourseUpdate
from helpers.helpers import get_next_course_id, serialize_doc
from helpers.auth import get_current_user

router = APIRouter()

#Create Course
@router.post("/courses/")
async def create_course(course: Course):
    # Validate department exists
    department = await departments_collection.find_one({"department_id": course.department_id})
    if not department:
        raise HTTPException(status_code=400, detail="Invalid department ID")
    
    course_id = await get_next_course_id()
    
    course_data = course.model_dump()
    course_data["course_id"] = course_id
    
    await courses_collection.insert_one(course_data)
    return {"message": "Course added successfully", "id": course_id}

# Get all courses with department names
@router.get("/courses/")
async def get_courses():
    courses = await courses_collection.find().to_list(100)
    enriched_courses = []
    
    for course in courses:
        course_data = serialize_doc(course)
        # Get department name
        if course.get("department_id"):
            department = await departments_collection.find_one(
                {"department_id": course["department_id"]},
                {"name": 1, "_id": 0}
            )
            course_data["department_name"] = department["name"] if department else "Unknown"
        enriched_courses.append(course_data)
    
    return enriched_courses

#Get course by ID with department name
@router.get("/courses/{course_id}")
async def get_course(course_id: str):
    course = await courses_collection.find_one({"course_id": course_id})
    
    if not course:
        raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
    
    course_data = serialize_doc(course)
    
    # Get department name
    if course.get("department_id"):
        department = await departments_collection.find_one(
            {"department_id": course["department_id"]},
            {"name": 1, "_id": 0}
        )
        course_data["department_name"] = department["name"] if department else "Unknown"
    
    return course_data

#Update Course
@router.put("/courses/{course_id}")
async def update_course(course_id: str, course: CourseUpdate):
    # Validate department if it's being updated
    if course.department_id:
        department = await departments_collection.find_one({"department_id": course.department_id})
        if not department:
            raise HTTPException(status_code=400, detail="Invalid department ID")
    
    update_data = course.model_dump(exclude_unset=True)
    result = await courses_collection.update_one(
        {"course_id": course_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    
    return {"message": "Course updated successfully"}

#Delete Course
@router.delete("/courses/{course_id}")  # Removed admin/ prefix
async def delete_course(course_id: str):
    """Allows an admin to delete a course and clean up related data"""
    
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Only admins can delete courses")
    
    # Check if course exists
    course = await courses_collection.find_one({"course_id": course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    #Find enrolled students
    enrollments = await enrollments_collection.find({"course_id": course_id}).to_list(None)
    
    #Restore credit hours for affected students
    for enrollment in enrollments:
        await students_collection.update_one(
            {"student_id": enrollment["student_id"]},
            {"$inc": {"credit_hours": course["credit_hours"]}}
        )
        
    #Remove all enrollments & schedules
    await enrollments_collection.delete_many({"course_id": course_id})
    await schedules_collection.delete_many({"course_id": course_id})
    
    #Delete the course
    await courses_collection.delete_one({"course_id": course_id})
    
    return {"message": f"Course {course_id} has been deleted"}