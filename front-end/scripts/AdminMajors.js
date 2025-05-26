const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

async function loadMajors() {
    try {
        const response = await fetch(`${API_BASE_URL}/majors/`);
        const majors = await response.json();
        const tbody = document.querySelector('#majorsTable tbody');
        tbody.innerHTML = '';
        majors.forEach(major => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${major.major_id || ''}</td>
                <td>${major.name}</td>
                <td>${major.description || ''}</td>
                <td>
                    <button class="btn btn-sm btn-secondary me-2" onclick="editMajor('${major.major_id}', '${major.name.replace(/'/g, "&#39;")}', '${(major.description || '').replace(/'/g, "&#39;")}' )">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMajor('${major.major_id}')">Delete</button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        alert('Failed to load majors.');
    }
}

window.editMajor = function(major_id, name, description) {
    document.getElementById('major_id').value = major_id;
    document.getElementById('major_name').value = name;
    document.getElementById('major_description').value = description;
    const modal = new bootstrap.Modal(document.getElementById('majorModal'));
    modal.show();
};

window.deleteMajor = async function(major_id) {
    if (!confirm('Are you sure you want to delete this major?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/majors/${major_id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error();
        loadMajors();
    } catch {
        alert('Failed to delete major.');
    }
};

document.getElementById('majorForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const major_id = document.getElementById('major_id').value;
    const name = document.getElementById('major_name').value;
    const description = document.getElementById('major_description').value;
    const data = { name, description };
    try {
        let response;
        if (major_id) {
            response = await fetch(`${API_BASE_URL}/majors/${major_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch(`${API_BASE_URL}/majors/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
        if (!response.ok) throw new Error();
        document.getElementById('majorForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('majorModal')).hide();
        loadMajors();
    } catch {
        alert('Failed to save major.');
    }
});

document.getElementById('addMajorBtn').addEventListener('click', function() {
    document.getElementById('majorForm').reset();
    document.getElementById('major_id').value = '';
});

document.addEventListener('DOMContentLoaded', loadMajors); 