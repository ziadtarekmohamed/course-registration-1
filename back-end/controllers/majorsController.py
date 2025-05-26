from fastapi import APIRouter, HTTPException, Body
from database import majors_collection
from models.Majors import Major
from helpers.helpers import get_next_id, serialize_doc

router = APIRouter()

@router.get("/majors/")
async def list_majors():
    majors = await majors_collection.find().to_list(100)
    return [serialize_doc(m) for m in majors]

@router.post("/majors/")
async def create_major(major: Major):
    # Generate a unique major_id
    major_id = await get_next_id("major")
    major_data = major.model_dump()
    major_data["major_id"] = major_id
    await majors_collection.insert_one(major_data)
    return {"message": "Major created successfully", "major_id": major_id}

@router.put("/majors/{major_id}")
async def update_major(major_id: str, major: Major = Body(...)):
    update_data = major.model_dump(exclude_unset=True)
    result = await majors_collection.update_one({"major_id": major_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Major not found")
    return {"message": "Major updated successfully"}

@router.delete("/majors/{major_id}")
async def delete_major(major_id: str):
    result = await majors_collection.delete_one({"major_id": major_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Major not found")
    return {"message": "Major deleted successfully"} 