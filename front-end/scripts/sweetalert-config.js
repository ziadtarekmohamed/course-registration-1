// SweetAlert2 Configuration
let sweetAlertInitialized = false;

document.addEventListener("DOMContentLoaded", function() {
    // If SweetAlert is already loaded from CDN in the page, configure it
    if (window.Swal) {
        configureSweetAlert();
    } else {
        // Otherwise load it dynamically
        const sweetAlertScript = document.createElement('script');
        sweetAlertScript.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
        sweetAlertScript.onload = configureSweetAlert;
        document.head.appendChild(sweetAlertScript);
    }
});

// Configure SweetAlert with custom styling
function configureSweetAlert() {
    if (window.Swal) {
        // Set default configuration without overriding the constructor
        Swal = Swal.mixin({
            confirmButtonColor: '#373B47', // Same color as sidebar
            cancelButtonColor: '#6c757d',
            focusConfirm: false
        });
        
        sweetAlertInitialized = true;
        console.log("SweetAlert2 configured successfully");
    }
}

// Helper functions for common SweetAlert2 operations

// Show success message
function showSuccess(message, title = 'Success') {
    if (window.Swal && sweetAlertInitialized) {
        return Swal.fire({
            title: title,
            text: message,
            icon: 'success',
            confirmButtonText: 'OK'
        });
    } else {
        alert(message);
        return Promise.resolve();
    }
}

// Show error message
function showError(message, title = 'Error') {
    if (window.Swal && sweetAlertInitialized) {
        return Swal.fire({
            title: title,
            text: message,
            icon: 'error',
            confirmButtonText: 'OK'
        });
    } else {
        alert(message);
        return Promise.resolve();
    }
}

// Show confirmation dialog
async function showConfirmation(message, title = 'Confirm', confirmText = 'Yes', cancelText = 'No') {
    if (window.Swal && sweetAlertInitialized) {
        const result = await Swal.fire({
            title: title,
            text: message,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: confirmText,
            cancelButtonText: cancelText
        });
        return result.isConfirmed;
    } else {
        return confirm(message);
    }
}

// Show loading dialog
function showLoading(message = 'Processing...') {
    if (window.Swal && sweetAlertInitialized) {
        return Swal.fire({
            title: message,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
    }
    return null;
}

// Close loading dialog
function closeLoading(swalInstance) {
    if (swalInstance && sweetAlertInitialized) {
        swalInstance.close();
    }
} 