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
    }
  });
});

async function createAccount() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirm_password').value;
  const errorMessage = document.getElementById('error-message');
  const fileInput = document.getElementById('profile_picture_upload');
  
  // Validate passwords match
  if (password !== confirmPassword) {
    errorMessage.textContent = 'Passwords do not match!';
    errorMessage.style.display = 'block';
    return;
  }

  // Check if file is selected
  const file = fileInput.files[0];
  if (!file) {
    errorMessage.textContent = 'Please select a profile picture!';
    errorMessage.style.display = 'block';
    return;
  }
  
  // Convert file to base64
  const reader = new FileReader();
  const profilePictureData = await new Promise((resolve, reject) => {
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });

  // Proceed with account creation
  fetch('http://localhost:3000/create_account', {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username: username,
      password: password,
      profilePicture: profilePictureData,
      pictureType: 'custom'  // Always custom for upload
    })
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
      globalThis.location.href = '../index.html';
    })
    .catch(error => {
      errorMessage.textContent = error.message;
      errorMessage.style.display = 'block';
      console.error(error);
    });
}