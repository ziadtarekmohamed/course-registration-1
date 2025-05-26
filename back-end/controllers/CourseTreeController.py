from fastapi import APIRouter, HTTPException, Depends
from database import (
    courses_collection,
    departments_collection
)
from typing import List, Dict, Any
from models.CourseTree import CourseTreeNode, CourseTreeFilter
from helpers.helpers import serialize_doc
from helpers.auth import get_current_user

router = APIRouter()

# Get course tree - supports filtering by department, level, and searching
# Updated get_course_tree function with improved level filtering
@router.get("/course-tree/")
async def get_course_tree(department_id: str = None, level: int = None, search: str = None):
    try:
        # Build base query for department filtering
        query = {}
        if department_id:
            department = await departments_collection.find_one({"department_id": department_id})
            if not department:
                raise HTTPException(status_code=400, detail="Invalid department ID")
            query["department_id"] = department_id
        
        # For search filtering
        if search:
            search_query = [
                {"name": {"$regex": search, "$options": "i"}},
                {"course_id": {"$regex": search, "$options": "i"}}
            ]
            
            if query:
                query = {
                    "$and": [
                        query,
                        {"$or": search_query}
                    ]
                }
            else:
                query["$or"] = search_query
        
        # Get all courses regardless of level for building the complete tree
        all_courses = await courses_collection.find({}).to_list(1000)
        
        # Create a dictionary to store all courses by their ID for easy lookup
        all_course_dict = {course["course_id"]: serialize_doc(course) for course in all_courses}
        
        # Now filter courses for the initial view based on query (department and search)
        if level:
            # Add level filtering to the query
            level_query = {
                "$or": [
                    {"level": level},
                    {"course_id": {"$regex": f"^{level}\\d{{2}}"}}
                ]
            }
            
            if query:
                query = {
                    "$and": [
                        query,
                        level_query
                    ]
                }
            else:
                query = level_query
                
        # Get filtered courses based on query (department, search, and level)
        filtered_courses = await courses_collection.find(query).to_list(1000)
        filtered_course_ids = {course["course_id"] for course in filtered_courses}
        
        # Add department names to each course
        for course_id, course in all_course_dict.items():
            if course.get("department_id"):
                department = await departments_collection.find_one(
                    {"department_id": course["department_id"]},
                    {"name": 1, "_id": 0}
                )
                course["department_name"] = department["name"] if department else "Unknown"
        
        # Function to get all prerequisite courses recursively (courses that lead to this course)
        def get_prerequisite_chain(course_id, visited=None):
            if visited is None:
                visited = set()
            
            if course_id in visited:
                return set()  # Avoid circular references
            
            visited.add(course_id)
            result = {course_id}
            
            course = all_course_dict.get(course_id)
            if course and course.get("prerequisites"):
                for prereq_id in course["prerequisites"]:
                    result.update(get_prerequisite_chain(prereq_id, visited.copy()))
            
            return result
        
        # Function to get all subsequent courses recursively (courses that depend on this course)
        def get_subsequent_chain(course_id, visited=None):
            if visited is None:
                visited = set()
            
            if course_id in visited:
                return set()  # Avoid circular references
            
            visited.add(course_id)
            result = {course_id}
            
            # Find all courses that have this course as a prerequisite
            for other_id, other_course in all_course_dict.items():
                if other_course.get("prerequisites") and course_id in other_course["prerequisites"]:
                    result.update(get_subsequent_chain(other_id, visited.copy()))
            
            return result
        
        # If level filtering is applied, expand the filtered set to include prerequisite and subsequent courses
        expanded_course_ids = set(filtered_course_ids)
        if level and filtered_course_ids:
            # For each filtered course, include its prerequisite chain and subsequent chain
            for course_id in list(filtered_course_ids):
                prereq_chain = get_prerequisite_chain(course_id)
                subsequent_chain = get_subsequent_chain(course_id)
                expanded_course_ids.update(prereq_chain)
                expanded_course_ids.update(subsequent_chain)
        
        # Build tree using either filtered or all courses based on whether filtering is applied
        course_dict = {course_id: all_course_dict[course_id] for course_id in expanded_course_ids if course_id in all_course_dict}
        if not course_dict:  # If no courses match the filters
            if level:  # If level filter was applied and returned no results
                course_dict = all_course_dict  # Fall back to all courses
            else:
                return []  # Return empty result if no courses match other filters
        
        # Add a flag to courses that match the level filter for frontend highlighting
        if level:
            for course_id, course in course_dict.items():
                # Check if course matches level filter
                matches_level = False
                if course.get("level") == level:
                    matches_level = True
                elif course["course_id"].startswith(str(level)):
                    matches_level = True
                
                course["matches_level_filter"] = matches_level
        
        # Build the tree structure
        root_nodes = []
        processed_courses = set()
        
        # First pass: identify root nodes (courses without prerequisites)
        for course_id, course in course_dict.items():
            # If course has no prerequisites or prerequisites are empty, it's a root node
            prerequisites = course.get("prerequisites") or []
            has_valid_prereqs = False
            
            # Check if all prerequisites are in our filtered set
            for prereq_id in prerequisites:
                if prereq_id in course_dict:
                    has_valid_prereqs = True
                    break
            
            if not has_valid_prereqs:
                root_data = {
                    "course_id": course["course_id"],
                    "name": course["name"],
                    "department_id": course["department_id"],
                    "department_name": course.get("department_name", "Unknown"),
                    "credit_hours": course["credit_hours"],
                    "children": [],
                    "semesters": course.get("semesters", []),
                    "level": course.get("level"),
                    "matches_level_filter": course.get("matches_level_filter", False)
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
                        "department_id": course["department_id"],
                        "department_name": course.get("department_name", "Unknown"),
                        "credit_hours": course["credit_hours"],
                        "prerequisites": course.get("prerequisites", []),
                        "children": [],
                        "semesters": course.get("semesters", []),
                        "level": course.get("level"),
                        "matches_level_filter": course.get("matches_level_filter", False)
                    }
                    processed_courses.add(course_id)
                    child_data["children"] = build_children(course_id)
                    children.append(child_data)
            return children
        
        # Build the tree for each root node
        for root in root_nodes:
            root["children"] = build_children(root["course_id"])
        
        # Group by department
        departments = {}
        for course in root_nodes:
            dept_id = course["department_id"]
            dept_name = course["department_name"]
            
            if dept_id not in departments:
                departments[dept_id] = {
                    "department_id": dept_id,
                    "department_name": dept_name,
                    "courses": []
                }
            
            departments[dept_id]["courses"].append(course)
        
        # Convert to list for response
        result = list(departments.values())
        
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
# Get course prerequisites chain for a specific course
@router.get("/course-tree/{course_id}")
async def get_course_prerequisites(course_id: str):
    try:
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
        
        # Get prerequisite courses
        prerequisites = []
        if course.get("prerequisites"):
            for prereq_id in course["prerequisites"]:
                prereq_course = await courses_collection.find_one({"course_id": prereq_id})
                if prereq_course:
                    prereq_data = serialize_doc(prereq_course)
                    
                    # Get department name for prerequisite
                    if prereq_course.get("department_id"):
                        prereq_dept = await departments_collection.find_one(
                            {"department_id": prereq_course["department_id"]},
                            {"name": 1, "_id": 0}
                        )
                        prereq_data["department_name"] = prereq_dept["name"] if prereq_dept else "Unknown"
                    
                    prerequisites.append(prereq_data)
        
        course_data["prerequisites_detail"] = prerequisites
        
        # Get courses that have this course as a prerequisite (subsequent courses)
        subsequent_courses = await courses_collection.find(
            {"prerequisites": course_id}
        ).to_list(100)
        
        subsequent_courses_data = []
        for sub_course in subsequent_courses:
            sub_data = serialize_doc(sub_course)
            
            # Get department name for subsequent course
            if sub_course.get("department_id"):
                sub_dept = await departments_collection.find_one(
                    {"department_id": sub_course["department_id"]},
                    {"name": 1, "_id": 0}
                )
                sub_data["department_name"] = sub_dept["name"] if sub_dept else "Unknown"
            
            subsequent_courses_data.append(sub_data)
        
        course_data["subsequent_courses"] = subsequent_courses_data
        
        return course_data
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Add prerequisite to a course
@router.post("/course-tree/{course_id}/prerequisites/{prereq_id}")
async def add_prerequisite(course_id: str, prereq_id: str):
    try:
        # Check if both courses exist
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
        
        prereq_course = await courses_collection.find_one({"course_id": prereq_id})
        if not prereq_course:
            raise HTTPException(status_code=404, detail=f"Prerequisite course not found, ID={prereq_id}")
        
        # Prevent circular dependencies
        if course_id in (prereq_course.get("prerequisites") or []):
            raise HTTPException(status_code=400, detail="Circular dependency detected")
        
        # Check if prerequisite already exists
        prerequisites = course.get("prerequisites") or []
        if prereq_id in prerequisites:
            return {"message": "Prerequisite already exists"}
        
        # Add prerequisite
        prerequisites.append(prereq_id)
        result = await courses_collection.update_one(
            {"course_id": course_id},
            {"$set": {"prerequisites": prerequisites}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Failed to update course")
        
        return {"message": f"Prerequisite {prereq_id} added to course {course_id}"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    
@router.patch("/course-tree/{course_id}/level")
async def update_course_level(course_id: str, level_data: dict):
    try:
        # Validate level value (it should be an integer between 100 and 900)
        if "level" not in level_data:
            raise HTTPException(status_code=400, detail="Level field is required")
        
        level = level_data["level"]
        
        # Allow null/None to clear the level
        if level is not None and (not isinstance(level, int) or level < 100 or level > 900):
            raise HTTPException(status_code=400, detail="Level must be a valid course level (100-900)")
        
        # Check if course exists
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
        
        # Update level
        result = await courses_collection.update_one(
            {"course_id": course_id},
            {"$set": {"level": level}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Failed to update course")
        
        return {"message": f"Level updated for course {course_id}", "level": level}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Remove prerequisite from a course
@router.delete("/course-tree/{course_id}/prerequisites/{prereq_id}")
async def remove_prerequisite(course_id: str, prereq_id: str):
    try:
        # Check if course exists
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
        
        # Check if prerequisite exists in the course
        prerequisites = course.get("prerequisites") or []
        if prereq_id not in prerequisites:
            raise HTTPException(status_code=404, detail=f"Prerequisite {prereq_id} not found in course {course_id}")
        
        # Remove prerequisite
        prerequisites.remove(prereq_id)
        result = await courses_collection.update_one(
            {"course_id": course_id},
            {"$set": {"prerequisites": prerequisites}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Failed to update course")
        
        return {"message": f"Prerequisite {prereq_id} removed from course {course_id}"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Get semester offerings for a course
@router.get("/course-tree/{course_id}/semesters")
async def get_course_semesters(course_id: str):
    try:
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
        
        semesters = course.get("semesters", [])
        return {"course_id": course_id, "semesters": semesters}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Update semester offerings for a course
@router.put("/course-tree/{course_id}/semesters")
async def update_course_semesters(course_id: str, semesters: List[str]):
    try:
        # Validate semester values
        valid_semesters = ["Fall", "Spring", "Summer"]
        for semester in semesters:
            if semester not in valid_semesters:
                raise HTTPException(status_code=400, detail=f"Invalid semester: {semester}")
        
        # Check if course exists
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
        
        # Update semesters
        result = await courses_collection.update_one(
            {"course_id": course_id},
            {"$set": {"semesters": semesters}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Failed to update course")
        
        return {"message": f"Semesters updated for course {course_id}", "semesters": semesters}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Validate course prerequisites chain to detect circular dependencies
@router.get("/course-tree/validate/{course_id}")
async def validate_prerequisites_chain(course_id: str):
    try:
        course = await courses_collection.find_one({"course_id": course_id})
        if not course:
            raise HTTPException(status_code=404, detail=f"Course not found, ID={course_id}")
        
        # Function to check for circular dependencies
        async def check_circular_dependency(current_id, visited=None):
            if visited is None:
                visited = set()
            
            if current_id in visited:
                return True  # Circular dependency detected
            
            visited.add(current_id)
            current_course = await courses_collection.find_one({"course_id": current_id})
            
            if not current_course:
                return False
            
            prerequisites = current_course.get("prerequisites") or []
            
            for prereq_id in prerequisites:
                if await check_circular_dependency(prereq_id, visited.copy()):
                    return True
            
            return False
        
        # Check if there's a circular dependency
        has_circular = await check_circular_dependency(course_id)
        
        if has_circular:
            return {"valid": False, "message": "Circular dependency detected in prerequisites chain"}
        else:
            return {"valid": True, "message": "Prerequisites chain is valid"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")