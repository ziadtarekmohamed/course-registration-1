from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import logging
import json
from typing import Dict, List, Callable, Any, Optional, Set
from pymongo.errors import PyMongoError
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_DETAILS = "mongodb+srv://HamsKhaled:YOXMvSlr7J7b5vED@courseregistration.doq7m.mongodb.net/"

client = AsyncIOMotorClient(MONGO_DETAILS)
database = client.Course_Registration

users_collection = database.get_collection("Users")
students_collection = database.get_collection("Student")
instructors_collection = database.get_collection("Instructor")
admins_collection = database.get_collection("Admin")
courses_collection = database.get_collection("Courses")
departments_collection = database.get_collection("Departments")
enrollments_collection = database.get_collection("Enrollments")
schedules_collection = database.get_collection("Schedule")
sessions_collection = database.get_collection("Sessions")
rooms_collection = database.get_collection("Rooms")
time_slots_collection = database.get_collection("TimeSlots")
semester_settings_collection = database.get_collection("SemesterSettings")
majors_collection = database.get_collection("Majors")

# Dictionary to store active change streams
active_change_streams = {}

# Dictionary to store WebSocket subscribers per collection
subscribers: Dict[str, Dict[str, Set[str]]] = {
    "enrollments": {},  # Map of student_id -> set of websocket_ids
    "schedules": {},    # Map of student_id -> set of websocket_ids
    "time_slots": {},   # Map of course_id -> set of websocket_ids
    "users": {},        # Map of user_id -> set of websocket_ids
    "courses": {},      # Map of course_id -> set of websocket_ids
}

# WebSocket connection storage
websocket_connections = {}

# Collection mapping for change streams
collection_mapping = {
    "enrollments": enrollments_collection,
    "schedules": schedules_collection,
    "time_slots": time_slots_collection,
    "users": users_collection,
    "courses": courses_collection,
}

# Function to create a change stream for a collection
async def create_change_stream(collection_name: str):
    """Create a change stream to monitor changes to a specific collection"""
    if collection_name not in collection_mapping:
        logger.error(f"Collection {collection_name} not found in mapping")
        return False
    
    # Check if change stream already exists
    if collection_name in active_change_streams:
        logger.info(f"Change stream for {collection_name} already exists")
        return True
    
    try:
        collection = collection_mapping[collection_name]
        # Create a change stream pipeline
        pipeline = [
            {"$match": {"operationType": {"$in": ["insert", "update", "delete", "replace"]}}}
        ]
        
        # Store the change stream in the dictionary
        change_stream = collection.watch(pipeline)
        active_change_streams[collection_name] = change_stream
        
        # Start a background task to process the change stream
        asyncio.create_task(process_change_stream(collection_name, change_stream))
        
        logger.info(f"Change stream created for {collection_name}")
        return True
    except PyMongoError as e:
        logger.error(f"Error creating change stream for {collection_name}: {str(e)}")
        return False

# Function to process change stream events
async def process_change_stream(collection_name: str, change_stream):
    """Process change stream events and notify relevant subscribers"""
    try:
        async with change_stream as stream:
            async for change in stream:
                # Extract relevant information from the change event
                operation_type = change.get("operationType")
                document_id = str(change.get("documentKey", {}).get("_id", ""))
                
                # For updates, get the updated fields
                updated_fields = {}
                if operation_type == "update" and "updateDescription" in change:
                    updated_fields = change["updateDescription"].get("updatedFields", {})
                
                # For inserts and replacements, get the full document
                full_document = None
                if operation_type in ["insert", "replace"] and "fullDocument" in change:
                    full_document = change["fullDocument"]
                
                # Create a structured event to send to clients
                event = {
                    "collection": collection_name,
                    "operation": operation_type,
                    "document_id": document_id,
                    "timestamp": datetime.now().isoformat(),
                }
                
                if updated_fields:
                    event["updated_fields"] = updated_fields
                
                if full_document:
                    event["document"] = full_document
                
                # Identify which subscribers should receive this update
                await notify_subscribers(collection_name, event)
                
    except PyMongoError as e:
        logger.error(f"Error in change stream for {collection_name}: {str(e)}")
        # Remove the change stream from active streams
        if collection_name in active_change_streams:
            del active_change_streams[collection_name]
        
        # Try to recreate the change stream after a short delay
        await asyncio.sleep(5)
        await create_change_stream(collection_name)
    except asyncio.CancelledError:
        logger.info(f"Change stream for {collection_name} was cancelled")
    except Exception as e:
        logger.error(f"Unexpected error in change stream for {collection_name}: {str(e)}")

# Function to notify subscribers of changes
async def notify_subscribers(collection_name: str, event: Dict[str, Any]):
    """Notify relevant subscribers about a change event"""
    if collection_name not in subscribers:
        return
    
    # Determine which subscribers should receive this update
    # This depends on the collection and the specific document that changed
    subscription_ids = set()
    
    # Extract document ID and other relevant fields based on collection
    document = event.get("document", {})
    document_id = event.get("document_id", "")
    
    if collection_name == "enrollments":
        # For enrollments, notify subscribers based on student_id
        student_id = document.get("student_id", "")
        if student_id and student_id in subscribers["enrollments"]:
            subscription_ids.update(subscribers["enrollments"][student_id])
            
        # Also notify subscribers for the specific course
        course_id = document.get("course_id", "")
        if course_id and course_id in subscribers["courses"]:
            subscription_ids.update(subscribers["courses"][course_id])
            
    elif collection_name == "schedules":
        # For schedules, notify subscribers based on student_id
        student_id = document.get("student_id", "")
        if student_id and student_id in subscribers["schedules"]:
            subscription_ids.update(subscribers["schedules"][student_id])
            
    elif collection_name == "time_slots":
        # For time slots, notify subscribers based on course_id
        course_id = document.get("course_id", "")
        if course_id and course_id in subscribers["time_slots"]:
            subscription_ids.update(subscribers["time_slots"][course_id])
            
    elif collection_name == "users":
        # For users, notify subscribers based on user_id
        user_id = document.get("user_id", "") or document.get("student_id", "") or document.get("instructor_id", "")
        if user_id and user_id in subscribers["users"]:
            subscription_ids.update(subscribers["users"][user_id])
            
    elif collection_name == "courses":
        # For courses, notify subscribers based on course_id
        course_id = document.get("course_id", "")
        if course_id and course_id in subscribers["courses"]:
            subscription_ids.update(subscribers["courses"][course_id])
    
    # Send the event to all identified subscribers
    for websocket_id in subscription_ids:
        if websocket_id in websocket_connections:
            websocket = websocket_connections[websocket_id]
            try:
                await websocket.send_text(json.dumps(event))
            except Exception as e:
                logger.error(f"Error sending update to websocket {websocket_id}: {str(e)}")
                # Clean up if the connection is dead
                unregister_websocket(websocket_id)

# Function to register a websocket connection
def register_websocket(websocket_id: str, websocket):
    """Register a new WebSocket connection"""
    websocket_connections[websocket_id] = websocket
    logger.info(f"Registered WebSocket connection {websocket_id}")

# Function to unregister a websocket connection
def unregister_websocket(websocket_id: str):
    """Unregister a WebSocket connection and remove its subscriptions"""
    if websocket_id in websocket_connections:
        del websocket_connections[websocket_id]
    
    # Remove this websocket from all subscriptions
    for collection_name in subscribers:
        for entity_id in list(subscribers[collection_name].keys()):
            if websocket_id in subscribers[collection_name][entity_id]:
                subscribers[collection_name][entity_id].remove(websocket_id)
                # Clean up empty sets
                if not subscribers[collection_name][entity_id]:
                    del subscribers[collection_name][entity_id]
    
    logger.info(f"Unregistered WebSocket connection {websocket_id}")

# Function to subscribe a websocket to updates for a specific entity
def subscribe_to_updates(collection_name: str, entity_id: str, websocket_id: str):
    """Subscribe a WebSocket to updates for a specific entity in a collection"""
    if collection_name not in subscribers:
        subscribers[collection_name] = {}
    
    if entity_id not in subscribers[collection_name]:
        subscribers[collection_name][entity_id] = set()
    
    subscribers[collection_name][entity_id].add(websocket_id)
    logger.info(f"WebSocket {websocket_id} subscribed to {collection_name}/{entity_id}")
    
    # Ensure a change stream exists for this collection
    asyncio.create_task(create_change_stream(collection_name))

# Function to unsubscribe a websocket from updates for a specific entity
def unsubscribe_from_updates(collection_name: str, entity_id: str, websocket_id: str):
    """Unsubscribe a WebSocket from updates for a specific entity"""
    if (collection_name in subscribers and 
        entity_id in subscribers[collection_name] and 
        websocket_id in subscribers[collection_name][entity_id]):
        
        subscribers[collection_name][entity_id].remove(websocket_id)
        # Clean up empty sets
        if not subscribers[collection_name][entity_id]:
            del subscribers[collection_name][entity_id]
        
        logger.info(f"WebSocket {websocket_id} unsubscribed from {collection_name}/{entity_id}")

# Function to close all active change streams
async def close_change_streams():
    """Close all active change streams"""
    for collection_name, change_stream in active_change_streams.items():
        try:
            await change_stream.close()
            logger.info(f"Closed change stream for {collection_name}")
        except Exception as e:
            logger.error(f"Error closing change stream for {collection_name}: {str(e)}")
    
    active_change_streams.clear()

# Function to create indexes
async def create_indexes():
    logger.info("Creating database indexes...")
    
    try:
        # Check for duplicate emails before creating unique index
        duplicate_emails = []
        email_counts = {}
        
        # Find duplicate emails
        async for user in users_collection.find({}, {'email': 1}):
            email = user.get('email')
            if email:
                email_counts[email] = email_counts.get(email, 0) + 1
                if email_counts[email] > 1 and email not in duplicate_emails:
                    duplicate_emails.append(email)
        
        # Handle duplicate emails if found
        if duplicate_emails:
            logger.warning(f"Found {len(duplicate_emails)} duplicate email(s): {duplicate_emails}")
            for email in duplicate_emails:
                # Find all documents with this email
                docs_with_email = []
                async for doc in users_collection.find({'email': email}):
                    docs_with_email.append(doc)
                
                # Keep the first document, update others with a unique email
                for i, doc in enumerate(docs_with_email[1:], 1):
                    unique_email = f"{email}.duplicate{i}"
                    logger.info(f"Updating duplicate email {email} to {unique_email}")
                    await users_collection.update_one(
                        {'_id': doc['_id']},
                        {'$set': {'email': unique_email}}
                    )
        
        # Create indexes individually with try/except blocks
        index_results = {"success": [], "failed": []}
        
        # Indexes for users collection
        try:
            await users_collection.create_index("email", unique=True, background=True)
            index_results["success"].append("users.email")
        except Exception as e:
            logger.error(f"Failed to create index users.email: {str(e)}")
            index_results["failed"].append("users.email")
        
        try:
            await users_collection.create_index("student_id", background=True)
            index_results["success"].append("users.student_id")
        except Exception as e:
            logger.error(f"Failed to create index users.student_id: {str(e)}")
            index_results["failed"].append("users.student_id")
        
        try:
            await users_collection.create_index("role", background=True)
            index_results["success"].append("users.role")
        except Exception as e:
            logger.error(f"Failed to create index users.role: {str(e)}")
            index_results["failed"].append("users.role")
        
        # Indexes for courses collection
        try:
            await courses_collection.create_index("course_id", unique=True, background=True)
            index_results["success"].append("courses.course_id")
        except Exception as e:
            logger.error(f"Failed to create index courses.course_id: {str(e)}")
            index_results["failed"].append("courses.course_id")
        
        try:
            await courses_collection.create_index("department_id", background=True)
            index_results["success"].append("courses.department_id")
        except Exception as e:
            logger.error(f"Failed to create index courses.department_id: {str(e)}")
            index_results["failed"].append("courses.department_id")
        
        try:
            await courses_collection.create_index("semesters", background=True)
            index_results["success"].append("courses.semesters")
        except Exception as e:
            logger.error(f"Failed to create index courses.semesters: {str(e)}")
            index_results["failed"].append("courses.semesters")
        
        try:
            await courses_collection.create_index("prerequisites", background=True)
            index_results["success"].append("courses.prerequisites")
        except Exception as e:
            logger.error(f"Failed to create index courses.prerequisites: {str(e)}")
            index_results["failed"].append("courses.prerequisites")
        
        # Indexes for enrollments collection
        try:
            await enrollments_collection.create_index([("student_id", 1), ("course_id", 1)], background=True)
            index_results["success"].append("enrollments.student_id_course_id")
        except Exception as e:
            logger.error(f"Failed to create index enrollments.student_id_course_id: {str(e)}")
            index_results["failed"].append("enrollments.student_id_course_id")
        
        try:
            await enrollments_collection.create_index("status", background=True)
            index_results["success"].append("enrollments.status")
        except Exception as e:
            logger.error(f"Failed to create index enrollments.status: {str(e)}")
            index_results["failed"].append("enrollments.status")
        
        # Indexes for departments collection
        try:
            await departments_collection.create_index("department_id", unique=True, background=True)
            index_results["success"].append("departments.department_id")
        except Exception as e:
            logger.error(f"Failed to create index departments.department_id: {str(e)}")
            index_results["failed"].append("departments.department_id")
        
        # Indexes for rooms collection
        try:
            await rooms_collection.create_index("room_id", unique=True, background=True)
            index_results["success"].append("rooms.room_id")
        except Exception as e:
            logger.error(f"Failed to create index rooms.room_id: {str(e)}")
            index_results["failed"].append("rooms.room_id")
        
        # Indexes for time slots collection for faster querying
        try:
            await time_slots_collection.create_index("course_id", background=True)
            index_results["success"].append("time_slots.course_id")
        except Exception as e:
            logger.error(f"Failed to create index time_slots.course_id: {str(e)}")
            index_results["failed"].append("time_slots.course_id")
            
        try:
            await time_slots_collection.create_index("slot_id", unique=True, background=True)
            index_results["success"].append("time_slots.slot_id")
        except Exception as e:
            logger.error(f"Failed to create index time_slots.slot_id: {str(e)}")
            index_results["failed"].append("time_slots.slot_id")
        
        # Log results
        logger.info(f"Successfully created {len(index_results['success'])} indexes: {', '.join(index_results['success'])}")
        if index_results["failed"]:
            logger.warning(f"Failed to create {len(index_results['failed'])} indexes: {', '.join(index_results['failed'])}")
        else:
            logger.info("All database indexes created successfully")
    except Exception as e:
        # Log the error but don't crash the application
        logger.error(f"Error during index creation process: {str(e)}")
        logger.info("The application will continue to run without some indexes")

# Create the startup event handler
async def on_startup():
    try:
        # Create indexes when application starts
        await create_indexes()
        
        # Initialize change streams for real-time updates
        for collection_name in collection_mapping.keys():
            await create_change_stream(collection_name)
            
        logger.info("Connected to MongoDB with real-time updates enabled!")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        # Don't crash the app, log and continue
        logger.warning("Application may have reduced functionality due to database connection issues")

# Create shutdown event handler for cleanup
async def on_shutdown():
    try:
        # Close all active change streams
        await close_change_streams()
        logger.info("Closed all database change streams")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")

# We don't run this directly, it should be imported and run by the app startup