"""
MongoDB Connection Test Script

This script tests the connection to MongoDB and verifies that the database
configured in database.py is accessible and working properly.
"""

import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient
import traceback

# Import the database configuration from our app
try:
    from database import MONGO_DETAILS, database
    print(f"Loaded database configuration: {MONGO_DETAILS}")
except ImportError:
    print("Could not import database module. Make sure you're running this from the back-end directory.")
    sys.exit(1)

async def test_connection():
    """Test the MongoDB connection and verify database access."""
    print("\n=== Testing MongoDB Connection ===")
    try:
        # Try to connect using the existing connection string
        client = AsyncIOMotorClient(MONGO_DETAILS)
        
        # Ping the server to check connection
        await client.admin.command('ping')
        print("✅ Successfully connected to MongoDB!")
        
        # List all databases
        db_list = await client.list_database_names()
        print(f"\nAvailable databases: {', '.join(db_list)}")
        
        # Check if our specific database exists
        db_name = database.name
        if db_name in db_list:
            print(f"✅ Database '{db_name}' exists")
        else:
            print(f"❌ Warning: Database '{db_name}' doesn't exist yet")
        
        # List collections in our database
        collections = await database.list_collection_names()
        if collections:
            print(f"\nCollections in '{db_name}': {', '.join(collections)}")
            
            # Check rooms collection
            if "Rooms" in collections:
                rooms_count = await database.Rooms.count_documents({})
                print(f"✅ 'Rooms' collection exists with {rooms_count} documents")
            else:
                print("❌ Warning: 'Rooms' collection doesn't exist")
        else:
            print(f"❌ Warning: No collections found in '{db_name}' database")
        
    except Exception as e:
        print(f"❌ Error connecting to MongoDB: {str(e)}")
        print("\nTraceback:")
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    print("MongoDB Connection Tester")
    print("=========================")
    
    # Run the async test function
    if asyncio.run(test_connection()):
        print("\n✅ MongoDB connection test completed successfully")
    else:
        print("\n❌ MongoDB connection test failed")
        print("Please check your connection string and network configuration.")
        sys.exit(1) 