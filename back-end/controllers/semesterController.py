from fastapi import APIRouter, HTTPException, Depends
from database import semester_settings_collection
from models.SemesterSettings import SemesterSettings, SemesterUpdate, SemesterType, RegistrationPeriodSettings
from helpers.auth import get_current_user, TokenData
from datetime import datetime, timezone

router = APIRouter()

SETTINGS_ID = "semester_settings" # Using a fixed ID for semester settings document

# Get current semester settings
@router.get("/semester/current")
async def get_current_semester():
    """Get the current semester settings"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings:
        # If not settings exist, create default settings
        default_settings = SemesterSettings(
            current_semester=SemesterType.FALL,
            academic_year="2024-2025",
            start_date="2024-10-01",
            end_date="2025-01-5",
            registration_periods=RegistrationPeriodSettings(
                registration_enabled=False,
                withdrawal_enabled=False
            )
        )
        await semester_settings_collection.insert_one({"_id": SETTINGS_ID, **default_settings.model_dump()})
        return default_settings
    
    # Remove MONGODB _id field
    if "_id" in settings:
        del settings["_id"]
        
    return settings

# Update semester settings
@router.put("/semester/current")
async def update_semester_settings(settings_update: SemesterUpdate, user: TokenData = Depends(get_current_user)):
    """Update the current semester settings (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can update semester settings")
    
    # Get current settings
    current_settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    # Create if doesn't exist
    if not current_settings:
        default_settings = SemesterSettings(
            current_semester=SemesterType.FALL,
            academic_year="2024-2025",
            start_date="2024-09-01",
            end_date="2024-12-15",
            registration_periods=RegistrationPeriodSettings(
                registration_enabled=False,
                withdrawal_enabled=False
            )
        )
        current_settings = {"_id": SETTINGS_ID, **default_settings.model_dump()}
        await semester_settings_collection.insert_one(current_settings)
        
    # Update fields that are provided
    update_data = settings_update.model_dump(exclude_unset=True)
    
    if update_data:
        await semester_settings_collection.update_one(
            {"_id": SETTINGS_ID},
            {"$set": update_data}
        )
        
    # Get updated settings
    updated_settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    # Remove MONGODB _id field
    if "_id" in updated_settings:
        del updated_settings["_id"]
        
    return updated_settings

@router.put("/semester/registration")
async def update_registration_periods(
    registration_periods: RegistrationPeriodSettings, 
    user: TokenData = Depends(get_current_user)
):
    """Update the registration and withdrawal periods (admin only)"""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can update registration periods")
    
    # Get current settings
    current_settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    # Create if doesn't exist
    if not current_settings:
        default_settings = SemesterSettings(
            current_semester=SemesterType.FALL,
            academic_year="2024-2025",
            start_date="2024-09-01",
            end_date="2024-12-15",
            registration_periods=registration_periods
        )
        current_settings = {"_id": SETTINGS_ID, **default_settings.model_dump()}
        await semester_settings_collection.insert_one(current_settings)
    else:
        # Update registration periods
        await semester_settings_collection.update_one(
            {"_id": SETTINGS_ID},
            {"$set": {"registration_periods": registration_periods.model_dump()}}
        )
    
    # Get updated settings
    updated_settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    # Remove MONGODB _id field
    if "_id" in updated_settings:
        del updated_settings["_id"]
    
    return updated_settings

@router.get("/semester/registration/status")
async def check_registration_status():
    """Check if course registration is currently allowed"""
    settings = await semester_settings_collection.find_one({"_id": SETTINGS_ID})
    
    if not settings or "registration_periods" not in settings:
        return {
            "registration_allowed": False,
            "withdrawal_allowed": False,
            "message": "Registration period not configured"
        }
    
    reg_periods = settings["registration_periods"]
    current_time = datetime.now(timezone.utc)
    
    # Check if registration is enabled and in valid time period
    registration_allowed = reg_periods.get("registration_enabled", False)
    if registration_allowed and reg_periods.get("registration_start_date") and reg_periods.get("registration_end_date"):
        start_date = reg_periods["registration_start_date"]
        end_date = reg_periods["registration_end_date"]
        
        # If dates are strings, convert them to datetime objects
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        registration_allowed = start_date <= current_time <= end_date
    
    # Check if withdrawal is enabled and in valid time period
    withdrawal_allowed = reg_periods.get("withdrawal_enabled", False)
    if withdrawal_allowed and reg_periods.get("withdrawal_start_date") and reg_periods.get("withdrawal_end_date"):
        start_date = reg_periods["withdrawal_start_date"]
        end_date = reg_periods["withdrawal_end_date"]
        
        # If dates are strings, convert them to datetime objects
        if isinstance(start_date, str):
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        if isinstance(end_date, str):
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
        withdrawal_allowed = start_date <= current_time <= end_date
    
    return {
        "registration_allowed": registration_allowed,
        "withdrawal_allowed": withdrawal_allowed,
        "current_time": current_time.isoformat(),
        "registration_periods": reg_periods
    }