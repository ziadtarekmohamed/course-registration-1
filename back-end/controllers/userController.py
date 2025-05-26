from fastapi import APIRouter, HTTPException, Depends,Body
from database import users_collection, departments_collection
from models.Users import Student, Instructor, Admin, UpdateUserModel
from helpers.helpers import get_next_id, serialize_doc
from helpers.auth import get_current_user
from bcrypt import hashpw, gensalt

router = APIRouter()

# Create user
@router.post("/users/")
async def create_user(user: Student | Instructor | Admin):
    if isinstance(user, Student):
        role = "student"
        if not hasattr(user, 'major') or not user.major:
            raise HTTPException(status_code=400, detail="Major is required for students")
    elif isinstance(user, Instructor):
        role = "instructor"
        
        #Validate if the department exists
        department = await departments_collection.find_one({"department_id": user.department_id})
        
        if not department:
            raise HTTPException(status_code=400, detail="Invalid department ID. Please select a valid department")
        
    elif isinstance(user, Admin):
        role = "admin"
    else:
        raise HTTPException(status_code=400, detail="Invalid user type")
    
    user_id = await get_next_id(role)
    
    user_data = user.model_dump()
    user_data[f"{role}_id"] = user_id
    user_data["role"] = role
    user_data["password"] = hashpw(user_data["password"].encode(), gensalt()).decode()
    
    await users_collection.insert_one(user_data)
    return {"message": f"{role.capitalize} created successfully", "id":user_id}

#user: dict = Depends(get_current_user)
#Get all users
@router.get("/users/")
async def get_users():
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    users = await users_collection.find().to_list(100)
    for user in users:
        if "department_id" in user:
            department = await departments_collection.find_one({"department_id": user["department_id"]}, {"_id": 0, "name": 1})
            user["department_name"] = department["name"] if department else "Unknown"
    
    return [serialize_doc(user) for user in users]

# Get user by ID
@router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await users_collection.find_one({"$or":[
        {"student_id": user_id},
        {"instructor_id": user_id},
        {"admin_id": user_id}
    ]})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return serialize_doc(user)

# Update User (password hidden)
@router.patch("/users/{user_id}")
@router.put("/users/{user_id}")
async def update_user(user_id: str, updated_data: UpdateUserModel = Body(...)):
    update_fields = updated_data.model_dump(exclude_unset=True)
    
    print(f"Updating user {user_id} with data: {update_fields}")
    
    if "department_id" in update_fields:
        department = await departments_collection.find_one({"department_id": update_fields["department_id"]})
        if not department:
            raise HTTPException(status_code=400, detail="Invalid department ID. Please select a valid department")
    
    if "major" in update_fields and not update_fields["major"]:
        raise HTTPException(status_code=400, detail="Major cannot be empty for students")
    
    result = await users_collection.update_one(
        {"$or":[
            {"student_id": user_id},
            {"instructor_id": user_id},
            {"admin_id": user_id}
        ]},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated successfully"}

# Delete User
@router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    # if user["role"] != "admin":
    #     raise HTTPException(status_code=403, detail="Unauthorized access")
    
    result = await users_collection.delete_one({"$or":[
        {"student_id": user_id},
        {"instructor_id": user_id},
        {"admin_id": user_id}
    ]})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}

# Delete all users
@router.delete("/users/")
async def delete_all_users(user: dict = Depends(get_current_user)):
    """Delete all users from the system. Only accessible by admin users."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete all users")
    
    # Delete all users
    result = await users_collection.delete_many({})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No users found to delete")
    
    return {
        "message": f"Successfully deleted {result.deleted_count} users",
        "deleted_count": result.deleted_count
    }