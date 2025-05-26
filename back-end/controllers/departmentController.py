from fastapi import APIRouter, HTTPException, Depends
from database import departments_collection, courses_collection
from models.Departments import Department
from helpers.helpers import get_next_department_id, serialize_doc
from helpers.auth import get_current_user

router = APIRouter()

#Create Department
@router.post("/departments/")
async def create_department(department: Department):
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    department_id = await get_next_department_id()
    
    department_data = department.model_dump()
    department_data["department_id"] = department_id
    
    await departments_collection.insert_one(department_data)
    return {"message": "Department added successfully", "id": department_id}

#Get All Departments
@router.get("/departments/")
async def get_departments():
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    departments = await departments_collection.find().to_list(100)
    return [serialize_doc(department) for department in departments]

#Get Department By ID
@router.get("/departments/{department_id}")
async def get_department(department_id: str):
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    department = await departments_collection.find_one(department_id)
    
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    return serialize_doc(department)

#Update Department
@router.put("/departments/{department_id}")
async def update_department(department_id: str, updated_data = dict):
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await departments_collection.update_one(
        {"department_id": department_id},
        {"$set": updated_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    
    return {"message": "Department updated successfully"}

#Delete Department
@router.delete("/departments/{department_id}")
async def delete_department(department_id: str):
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    department = departments_collection.find_one({"department_id": department_id})
    
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    deleted_courses = await courses_collection.delete_many({"department_id": department_id})
    
    await departments_collection.delete_one({"department_id": department_id})
    
    return {
        "message": f"Department {department_id} and {deleted_courses.deleted_count} related courses deleted successfully"
    }