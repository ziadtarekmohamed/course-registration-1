# Course Registration System

## Time Slot Selection and Schedule Viewing

The Course Registration System now supports time slot selection and schedule viewing with the following features:

### Time Slot Selection
- Students can select time slots for different course types (lecture, lab, tutorial) in the registration page
- Time slots are fetched from the backend API endpoint `/schedule/time-slots/{course_id}`
- Selected time slots are saved to the backend using the endpoint `/schedule/select-time-slot`
- The system supports conflict detection, showing warnings when time slots overlap
- Changes are immediately reflected in the student's schedule

### Schedule Viewing
- Students can view their complete schedule in the Schedule page
- The schedule is retrieved from the backend API endpoint `/schedule/`
- Time slots are displayed in a weekly calendar view, color-coded by type (lecture, lab, tutorial)
- The system shows statistics including:
  - Number of scheduled courses
  - Total credit hours
  - Weekly class hours
- Empty schedule states are handled with helpful messages

### API Endpoints
The following API endpoints are used for the schedule functionality:

- `GET /schedule/` - Get the student's complete schedule
- `GET /schedule/time-slots/{course_id}` - Get available time slots for a course
- `POST /schedule/select-time-slot` - Select a time slot for a course
- `GET /schedule/conflicts` - Check for conflicts in the student's schedule
- `GET /schedule/recommendations` - Get recommended time slot selections

### Data Flow
1. Student registers for a course in the Course Registration page
2. Student selects time slots for the registered course
3. Backend saves the time slot selections
4. Student can view their complete schedule in the Schedule page
5. Any changes to time slot selections are immediately reflected in the schedule

### Implementation Details
- Schedule is implemented using a responsive HTML table with appropriate CSS styling
- Time slots are positioned according to their day of week and start/end times
- The system correctly handles time slots that span multiple hours
- Empty states are displayed when no schedule data is available 