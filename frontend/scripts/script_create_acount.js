// deno-lint-ignore-file no-unused-vars
// Handle file upload and preview
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('profile_picture_upload');
  const imagePreview = document.getElementById('image-preview');
  const previewImg = document.getElementById('preview');

  // Handle file selection
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        imagePreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      // If file selection is cleared, hide the preview
      imagePreview.style.display = 'none';
    }
  });
});

async function createAccount() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm_password').value;
  const errorMessage = document.getElementById('error-message');
  const fileInput = document.getElementById('profile_picture_upload');
  
  // Clear previous error message
  errorMessage.style.display = 'none';
  
  // Validate username and password
  if (!username || !password) {
    errorMessage.textContent = 'Username and password are required!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Validate passwords match
  if (password !== confirmPassword) {
    errorMessage.textContent = 'Passwords do not match!';
    errorMessage.style.display = 'block';
    return;
  }

  // Create request data object
  const requestData = {
    username: username,
    password: password
  };

  // Check if there's a profile picture and add it if present
  const file = fileInput.files[0];
  if (file) {
    try {
      // Convert file to base64
      const reader = new FileReader();
      const profilePictureData = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });
      
      // Add to request data
      requestData.profilePicture = profilePictureData;
    } catch (error) {
      console.error("Error processing profile picture:", error);
      // Continue without the profile picture - will use default
    }
  }
  // If no file is selected, we don't add profilePicture to the request
  // and the server will use the default

  // Proceed with account creation
  fetch(appConfig.apiEndpoint('/create_account'), {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        return response.json().then(err => {
          throw new Error(err.error || 'Failed to create account.');
        });
      }
    })
    .then(data => {
      alert('Account created successfully!');
      globalThis.location.href = '../login.html';
    })
    .catch(error => {
      errorMessage.textContent = error.message;
      errorMessage.style.display = 'block';
      console.error(error);
    });
}