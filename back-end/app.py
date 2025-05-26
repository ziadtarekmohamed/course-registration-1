from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, status, Query
from fastapi.middleware.cors import CORSMiddleware
from controllers.userController import router as user_router
from controllers.courseController import router as course_router
from controllers.authController import router as auth_router
from controllers.enrollmentController import router as enrollment_router
from controllers.scheduleController import router as scheduleRouter
from controllers.departmentController import router as departmentRouter
from controllers.roomController import router as roomsRouter
from controllers.AdminTimeSlots import router as timeSlotsRouter
from controllers.CourseTreeController import router as course_tree_router
from controllers.semesterController import router as semester_router
from controllers.majorsController import router as majors_router
from database import (
    database, on_startup as init_db, on_shutdown as db_shutdown,
    register_websocket, unregister_websocket, subscribe_to_updates, unsubscribe_from_updates
)
import logging
import uuid
import json
from typing import Optional, List

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Course Registration System API",
    description="API for a university course registration system",
    version="1.0.0",
    on_startup=[init_db],
    on_shutdown=[db_shutdown]
)

app.include_router(user_router, prefix="/api/v1", tags=["Users"])
app.include_router(course_router, prefix="/api/v1", tags=["Courses"])
app.include_router(auth_router, prefix="/api", tags=["Authentication"])
app.include_router(enrollment_router, prefix="/api/v1", tags=["Enrollments"])
app.include_router(scheduleRouter, prefix="/api/v1", tags=["Schedule"])
app.include_router(departmentRouter, prefix="/api/v1", tags=["Department"])
app.include_router(course_tree_router, prefix="/api/v1", tags=["Course Tree"])
app.include_router(roomsRouter, prefix="/api/v1", tags=["Rooms"])
app.include_router(timeSlotsRouter, prefix="/api/v1", tags=["Time-Slots"])
app.include_router(semester_router,prefix="/api/v1", tags=["Semester-Router"])
app.include_router(majors_router, prefix="/api/v1", tags=["Majors"])


origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # For development - remove in production
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only - allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Test database endpoint
@app.get("/test-database")
async def test_database():
    collections = await database.list_collection_names()
    return {"collections": collections}

# WebSocket endpoint for real-time updates
@app.websocket("/ws/realtime")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: Optional[str] = None
):
    # Generate a unique ID for this WebSocket connection if not provided
    websocket_id = client_id or str(uuid.uuid4())
    
    # Accept the connection
    await websocket.accept()
    logger.info(f"WebSocket connection accepted: {websocket_id}")
    
    try:
        # Register this WebSocket connection
        register_websocket(websocket_id, websocket)
        
        # Send confirmation
        await websocket.send_text(json.dumps({
            "type": "connection_established",
            "client_id": websocket_id,
            "message": "Connected to real-time updates"
        }))
        
        # Listen for messages from the client
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                message_type = message.get("type")
                
                if message_type == "subscribe":
                    # Handle subscription request
                    collection = message.get("collection")
                    entity_id = message.get("entity_id")
                    
                    if collection and entity_id:
                        subscribe_to_updates(collection, entity_id, websocket_id)
                        await websocket.send_text(json.dumps({
                            "type": "subscription_confirmed",
                            "collection": collection,
                            "entity_id": entity_id
                        }))
                    else:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Invalid subscription request. Requires collection and entity_id."
                        }))
                
                elif message_type == "unsubscribe":
                    # Handle unsubscription request
                    collection = message.get("collection")
                    entity_id = message.get("entity_id")
                    
                    if collection and entity_id:
                        unsubscribe_from_updates(collection, entity_id, websocket_id)
                        await websocket.send_text(json.dumps({
                            "type": "unsubscription_confirmed",
                            "collection": collection,
                            "entity_id": entity_id
                        }))
                    else:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Invalid unsubscription request. Requires collection and entity_id."
                        }))
                
                elif message_type == "ping":
                    # Respond to ping with pong
                    await websocket.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": message.get("timestamp")
                    }))
                
                else:
                    # Handle unknown message type
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"Unknown message type: {message_type}"
                    }))
            
            except json.JSONDecodeError:
                # Handle invalid JSON
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
            except Exception as e:
                # Handle general error
                logger.error(f"Error processing WebSocket message: {str(e)}")
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": "Internal server error"
                }))
    
    except WebSocketDisconnect:
        # Handle disconnection
        logger.info(f"WebSocket disconnected: {websocket_id}")
    finally:
        # Clean up WebSocket connection and subscriptions
        unregister_websocket(websocket_id)