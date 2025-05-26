from fastapi import APIRouter, HTTPException, Depends, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from database import users_collection
from helpers.auth import (
    verify_password, 
    create_access_token, 
    create_refresh_token,
    decode_refresh_token,
    get_current_active_user,
    TokenData
)
from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel

router = APIRouter()

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/auth/login", response_model=TokenResponse)
async def login_user(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Dict[str, Any]:
    """Authenticates user and returns JWT tokens"""
    # Find user by email
    user = await users_collection.find_one({"email": form_data.username})
    
    # Check if user exists and password is correct
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check if user is active
    if user.get("is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Determine user role and ID
    role = "student" if "student_id" in user else "instructor" if "instructor_id" in user else "admin"
    user_id = user.get(f"{role}_id") if role != "admin" else str(user["_id"])
    
    # Prepare token data
    token_data = {
        "sub": user["email"],
        "role": role,
        "user_id": user_id,
        "name": user.get("name", ""),
        "iat": datetime.utcnow()
    }
    
    # Generate tokens
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    
    # Update last login
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshTokenRequest) -> Dict[str, Any]:
    """Refresh access token using refresh token"""
    try:
        # Decode refresh token
        payload = decode_refresh_token(request.refresh_token)
        
        # Get user from database
        user = await users_collection.find_one({"email": payload["sub"]})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Check if user is active
        if user.get("is_active", True) is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive"
            )
        
        # Determine user role and ID
        role = "student" if "student_id" in user else "instructor" if "instructor_id" in user else "admin"
        user_id = user.get(f"{role}_id") if role != "admin" else str(user["_id"])
        
        # Prepare token data
        token_data = {
            "sub": user["email"],
            "role": role,
            "user_id": user_id,
            "name": user.get("name", ""),
            "iat": datetime.utcnow()
        }
        
        # Generate new tokens
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

@router.post("/auth/logout")
async def logout_user(current_user: TokenData = Depends(get_current_active_user)):
    """Logout user and invalidate tokens"""
    # In a real application, you might want to blacklist the tokens
    # For now, we'll just return a success message
    return {"message": "Successfully logged out"}