const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

async function populateDepartments(selectElement){
    try{
        const response = await fetch(`${API_BASE_URL}/departments/`);
        if(!response.ok){
            throw new Error(`Failed to load departments: ${response.status}`);
        }
        const departments = await response.json();

        selectElement.innerHTML = '<option value="">Select a Department</option>';
        departments.forEach(dept =>{
            const option = document.createElement("option");
            option.value = dept.department_id;
            option.textContent = dept.name;
            selectElement.appendChild(option);
        });
    }catch(error){
        console.error("Error loading departments:", error);
        showErrorMessage("Failed to load departments. Please try again.");
    }
}

async function loadDepartments()
{
    try{
        const response = await fetch("http://127.0.0.1:8000/api/v1/departments/");
        if(!response.ok){
            throw new Error(`Failed to load departments: ${response.status}`);
        }
        const departments = await response.json();

        const departmentDropdown = document.getElementById("department_select");
        departmentDropdown.innerHTML = '<option value=""> Select a Department</option>';

        departments.forEach(dept => {
            const option = document.createElement("option");
            option.value = dept.department_id;
            option.textContent = dept.name;
            departmentDropdown.appendChild(option);
        });
    }catch(error){
        console.error("Error loading departments:", error);
        showErrorMessage("Failed to load departments. Please try again.");
    }
}

async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE_URL}/users/`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const users = await response.json();
        const studentTableBody = document.querySelector('#students tbody');
        const instructorTableBody = document.querySelector('#instructors tbody');
        const adminTableBody = document.querySelector('#admins tbody');

        studentTableBody.innerHTML = "";
        instructorTableBody.innerHTML = "";
        adminTableBody.innerHTML = "";

        users.forEach((user) => {
            let tableBody;
            let rowContent;
            let userId;

            switch (user.role) {
                case "student":
                    tableBody = studentTableBody;
                    userId = user.student_id;
                    rowContent = `
                        <td>${userId}</td>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${user.phone || ""}</td>
                        <td>${user.address || ""}</td>
                        <td>${user.GPA || ""}</td>
                    `;
                    break;
                case "instructor":
                    tableBody = instructorTableBody;
                    userId = user.instructor_id;
                    rowContent = `
                        <td>${userId}</td>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${user.phone}</td>
                        <td>${user.address}</td>
                        <td>${user.department_name || ""}</td>
                    `;
                    break;
                case "admin":
                    tableBody = adminTableBody;
                    userId = user.admin_id;
                    rowContent = `
                        <td>${userId}</td>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${user.phone}</td>
                        <td>${user.address}</td>
                    `;
                    break;
            }

            if (tableBody && userId) {
                const row = document.createElement("tr");
                row.innerHTML = `
                    ${rowContent}
                    <td>
                        <div class="dropdown">
                            <button class="btn btn-secondary btn-sm dropdown-toggle" type="button" id="dropdownMenuButton${userId}" data-bs-toggle="dropdown" aria-expanded="false">
                                Actions
                            </button>
                            <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton${userId}">
                                <li><a class="dropdown-item edit-user" href="#" data-id="${userId}" data-role="${user.role}">Edit</a></li>
                                <li><a class="dropdown-item delete-user text-danger" href="#" data-id="${userId}" data-role="${user.role}">Delete</a></li>
                            </ul>
                        </div>
                    </td>
                `;

                tableBody.appendChild(row);
            }
        });

        addEventListeners();
    } catch (error) {
        console.error("Error loading users:", error);
        showErrorMessage("An error occurred while loading users.");
    }
}

function addEventListeners() {
    document.querySelectorAll('.edit-user').forEach((button) => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const userId = this.getAttribute('data-id');
            const role = this.getAttribute('data-role');
            openEditModal(userId, role);
        });
    });

    document.querySelectorAll('.delete-user').forEach((button) => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            const userId = this.getAttribute('data-id');
            const role = this.getAttribute('data-role');
            
            try {
                const result = await Swal.fire({
                    title: 'Are you sure?',
                    text: "You won't be able to revert this!",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#373B47',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, delete it!'
                });

                if (result.isConfirmed) {
                    await deleteUser(userId, role);
                }
            } catch (error) {
                console.error('Error in delete confirmation:', error);
                showErrorMessage('Failed to delete user');
            }
        });
    });
}

async function createUser(userData) {
    try {
        const response = await fetch(`${API_BASE_URL}/users/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData),
        });

        if (response.ok) {
            const result = await response.json();
            loadUsers();
            // Close the modal after successful creation
            const modal = document.querySelector('.modal.show');
            if (modal) {
                bootstrap.Modal.getInstance(modal).hide();
            }
            showSuccessMessage('User created successfully!');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Unknown error occurred');
        }
    } catch (error) {
        console.error('Error creating user: ', error.message);
        showErrorMessage(`Error creating user: ${error.message}`);
    }
}

async function deleteUser(userId, role) {
    try {
        const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            showSuccessMessage('User deleted successfully!');
            loadUsers(); // Refresh the user list
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error:', error);
        showErrorMessage(error.message);
    }
}

async function openEditModal(userId, role) {
    try {
        const response = await fetch(`${API_BASE_URL}/users/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const user = await response.json();

        const editForm = document.getElementById('editForm');
        editForm.dataset.userId = userId;
        editForm.dataset.role = role;

        // Show/hide role-specific fields
        const gpaField = document.getElementById('edit_gpa').closest('.mb-3');
        const majorField = document.getElementById('edit_major').closest('.mb-3');
        const departmentContainer = document.getElementById('edit_department_container');
        const departmentSelect = document.getElementById('edit_department_select');

        if (role === 'student') {
            gpaField.style.display = 'block';
            majorField.style.display = 'block';
            departmentContainer.style.display = 'none';
            document.getElementById('edit_gpa').required = true;
            document.getElementById('edit_major').required = true;
            departmentSelect.required = false;
        } else if (role === 'instructor') {
            gpaField.style.display = 'none';
            majorField.style.display = 'none';
            departmentContainer.style.display = 'block';
            document.getElementById('edit_gpa').required = false;
            document.getElementById('edit_major').required = false;
            departmentSelect.required = true;
        } else {
            gpaField.style.display = 'none';
            majorField.style.display = 'none';
            departmentContainer.style.display = 'none';
            document.getElementById('edit_gpa').required = false;
            document.getElementById('edit_major').required = false;
            departmentSelect.required = false;
        }

        // Set form values
        document.getElementById('edit_name').value = user.name || '';
        document.getElementById('edit_email').value = user.email || '';
        document.getElementById('edit_phone').value = user.phone || '';
        document.getElementById('edit_address').value = user.address || '';
        
        if (role === 'student') {
            document.getElementById('edit_gpa').value = user.GPA || '';
            document.getElementById('edit_major').value = user.major || '';
        } else if (role === 'instructor') {
            document.getElementById('edit_department_select').value = user.department_id || '';
        }

        // Initialize and show the modal
        const editModal = new bootstrap.Modal(document.getElementById('editModal'));
        editModal.show();
    } catch (error) {
        console.error('Error fetching user details:', error);
        showErrorMessage('Failed to load user details');
    }
}

async function populateMajorsDropdown(selectId) {
    try {
        const response = await fetch(`${API_BASE_URL}/majors/`);
        if (!response.ok) {
            throw new Error('Failed to load majors');
        }
        const majors = await response.json();
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Select Major</option>';
        majors.forEach(major => {
            const option = document.createElement('option');
            option.value = major.name;
            option.textContent = major.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load majors:', error);
        showErrorMessage("Failed to load majors. Please try again.");
    }
}

// Populate majors when opening add/edit student modal
const studentModal = document.getElementById('studentModal');
if (studentModal) {
    studentModal.addEventListener('show.bs.modal', () => populateMajorsDropdown('major'));
}
const editModal = document.getElementById('editModal');
if (editModal) {
    editModal.addEventListener('show.bs.modal', () => populateMajorsDropdown('edit_major'));
}

// Move all event listener assignments inside DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Load initial data
    loadUsers();
    loadDepartments();

    // Add event listeners for forms
    document.getElementById('studentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const userData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            GPA: parseFloat(document.getElementById('gpa').value),
            password: document.getElementById('password').value,
            role: 'student',
            credit_hours: parseInt(document.getElementById('credit_hours').value),
            major: document.getElementById('major').value
        };
        createUser(userData);
    });

    document.getElementById('instructorForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const userData = {
            name: document.getElementById('instructor_name').value,
            email: document.getElementById('instructor_email').value,
            department_id: document.getElementById('department_select').value,
            password: document.getElementById('instructor_password').value,
            address: document.getElementById('instructor_address').value,
            role: 'instructor',
            phone: document.getElementById('instructor_phone').value
        };

        if (!userData.department_id) {
            showErrorMessage("Please select a department");
            return;
        }

        createUser(userData);
    });

    document.getElementById('adminForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const userData = {
            name: document.getElementById('admin_name').value,
            email: document.getElementById('admin_email').value,
            password: document.getElementById('admin_password').value,
            role: 'admin',
            phone: document.getElementById('admin_phone').value,
            address: document.getElementById('admin_address').value
        };
        createUser(userData);
    });

    // Add event listener for edit form
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = editForm.dataset.userId;
            const role = editForm.dataset.role;

            const userData = {
                name: document.getElementById('edit_name').value,
                email: document.getElementById('edit_email').value,
                phone: document.getElementById('edit_phone').value,
                address: document.getElementById('edit_address').value
            };

            // Add role-specific fields
            if (role === 'student') {
                userData.GPA = parseFloat(document.getElementById('edit_gpa').value);
                userData.major = document.getElementById('edit_major').value;
            } else if (role === 'instructor') {
                userData.department_id = document.getElementById('edit_department_select').value;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(userData)
                });

                if (response.ok) {
                    showSuccessMessage('User updated successfully!');
                    const modal = document.getElementById('editModal');
                    const bootstrapModal = bootstrap.Modal.getInstance(modal);
                    if (bootstrapModal) {
                        bootstrapModal.hide();
                    }
                    loadUsers(); // Refresh the user list
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Failed to update user');
                }
            } catch (error) {
                console.error('Error updating user:', error);
                showErrorMessage(error.message);
            }
        });
    }

    // Initialize Bootstrap tooltips and popovers if needed
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});