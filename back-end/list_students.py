import asyncio
import logging
from database import users_collection
from tabulate import tabulate

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def list_students(limit=10):
    """List students from the database"""
    try:
        # Find all students
        students = await users_collection.find(
            {"role": "student"},
            {
                "_id": 0,
                "student_id": 1,
                "name": 1, 
                "email": 1,
                "major": 1,
                "GPA": 1,
                "credit_hours": 1
            }
        ).sort("student_id", 1).limit(limit).to_list(limit)
        
        if not students:
            print("No students found in the database.")
            return []
        
        # Prepare data for display
        headers = ["ID", "Name", "Email", "Major", "GPA", "Credit Hours"]
        rows = []
        
        for student in students:
            rows.append([
                student.get("student_id", "N/A"),
                student.get("name", "N/A"),
                student.get("email", "N/A"),
                student.get("major", "N/A"),
                student.get("GPA", "N/A"),
                student.get("credit_hours", "N/A")
            ])
        
        # Display as table
        print(tabulate(rows, headers=headers, tablefmt="grid"))
        
        # Get total count
        count = await users_collection.count_documents({"role": "student"})
        if count > limit:
            print(f"\nShowing {limit} of {count} total students.")
        else:
            print(f"\nTotal students: {count}")
        
        return students
    
    except Exception as e:
        logger.error(f"Error listing students: {str(e)}")
        return []

async def main():
    # Number of students to display
    limit = 20
    
    print(f"Listing the first {limit} imported students:")
    print("-" * 50)
    
    await list_students(limit)

if __name__ == "__main__":
    # Run the async main function
    asyncio.run(main()) 