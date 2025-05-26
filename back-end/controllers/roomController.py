from fastapi import APIRouter, HTTPException, Depends, Request
from database import rooms_collection
from models.Rooms import Room, RoomUpdate
from helpers.auth import get_current_user
from helpers.helpers import generate_room_id
import traceback
from fastapi.responses import JSONResponse

router = APIRouter()

# Create room
@router.post("/rooms/")
async def create_room(room: Room, user: dict = Depends(get_current_user)):
    try:
        # Check if user is admin - handle both dict and object access
        user_role = user.get('role') if isinstance(user, dict) else getattr(user, 'role', None)
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        # Log the request data
        print(f"Received create room request with data: {room}")
        
        # Check if the room already exists
        existing_room = await rooms_collection.find_one({
            "building": room.building,
            "room_number": room.room_number
        })
        
        if existing_room:
            return JSONResponse(
                status_code=409,
                content={"detail": f"Room already exists with ID: {existing_room['room_id']}"}
            )
        
        # Generate room_id and check if provided room_id matches the pattern
        generated_room_id = f"{room.building}{str(room.room_number).zfill(3)}"
        
        # If client provided a room_id, verify it matches our pattern, otherwise use generated
        if room.room_id and room.room_id != generated_room_id:
            print(f"Warning: Client provided room_id {room.room_id} doesn't match generated {generated_room_id}")
        
        # Use the generated room_id for consistency
        room_data = room.model_dump()
        room_data["room_id"] = generated_room_id
        
        print(f"Inserting room with data: {room_data}")
        await rooms_collection.insert_one(room_data)
        
        return {"message": "Room created successfully", "room_id": generated_room_id}
    except Exception as e:
        print(f"Error creating room: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# Get all rooms
@router.get("/rooms/")
async def get_rooms():
    try:
        rooms = await rooms_collection.find().to_list(100)
        for room in rooms:
            room["_id"] = str(room["_id"])
        
        return rooms
    except Exception as e:
        print(f"Error getting rooms: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# Get room by ID
@router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    try:
        room = await rooms_collection.find_one({"room_id": room_id})
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        room["_id"] = str(room["_id"])  # Convert ObjectId to string
        return room
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting room: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# Update room
@router.put("/rooms/{room_id}")
async def update_room(room_id: str, room: RoomUpdate, user: dict = Depends(get_current_user)):
    try:
        # Check if user is admin - handle both dict and object access
        user_role = user.get('role') if isinstance(user, dict) else getattr(user, 'role', None)
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        # Log the request data
        print(f"Received update room request for {room_id} with data: {room}")
        
        # Get existing room to verify it exists
        existing_room = await rooms_collection.find_one({"room_id": room_id})
        if not existing_room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Create update data, excluding null values
        update_data = {k: v for k, v in room.model_dump(exclude_unset=True).items() if v is not None}
        
        # If room_number or building changes, regenerate room_id
        if (("room_number" in update_data and update_data["room_number"] != existing_room["room_number"]) or
            ("building" in update_data and update_data["building"] != existing_room["building"])):
            
            building = update_data.get("building", existing_room["building"])
            room_number = update_data.get("room_number", existing_room["room_number"])
            new_room_id = f"{building}{str(room_number).zfill(3)}"
            
            print(f"Regenerating room_id from {room_id} to {new_room_id}")
            
            # First delete the old room
            await rooms_collection.delete_one({"room_id": room_id})
            
            # Then insert the updated room with new ID
            new_room_data = {**existing_room, **update_data, "room_id": new_room_id}
            new_room_data.pop("_id")  # Remove the _id field
            await rooms_collection.insert_one(new_room_data)
            
            return {"message": "Room updated successfully", "new_room_id": new_room_id}
        else:
            # Normal update
            print(f"Updating room with data: {update_data}")
            result = await rooms_collection.update_one(
                {"room_id": room_id},
                {"$set": update_data}
            )
            
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Room not found")
            
            return {"message": "Room updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating room: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# Delete Room
@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(get_current_user)):
    try:
        # Check if user is admin - handle both dict and object access
        user_role = user.get('role') if isinstance(user, dict) else getattr(user, 'role', None)
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        print(f"Attempting to delete room: {room_id}")
        result = await rooms_collection.delete_one({"room_id": room_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Room not found")
        
        return {"message": f"Room {room_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error deleting room: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"}
        )

# Add OPTIONS endpoint to help with CORS preflight requests
@router.options("/rooms/")
@router.options("/rooms/{room_id}")
async def options_rooms():
    return {"message": "OK"}