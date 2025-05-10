// Global variables
let currentUserData = null;
let isCurrentUserProfile = false;
let isEditMode = false;
let originalImageData = null;
let newImageData = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Initialize handlers
    initializeHandlers();
    
    // Load profile data
    loadProfileData();
});

// Initialize all event handlers
function initializeHandlers() {
    // View mode handlers
    document.getElementById('modifyProfileBtn').addEventListener('click', switchToEditMode);
    document.getElementById('backToGameBtn').addEventListener('click', goBackToGame);
    
    // Edit mode handlers
    document.getElementById('profilePictureUpload').addEventListener('change', handleProfilePictureChange);
    document.getElementById('saveChangesBtn').addEventListener('click', saveProfileChanges);
    document.getElementById('cancelBtn').addEventListener('click', cancelEditing);
}

// Load profile data from server
async function loadProfileData() {
    try {
        // Get the current user's information
        const currentUsername = sessionStorage.getItem('currentUsername') || localStorage.getItem('currentUsername');
        
        // Check if we're viewing someone else's profile
        const profileToLoad = sessionStorage.getItem('profileToView') || currentUsername;
        
        // Clear the stored profile to view after using it
        sessionStorage.removeItem('profileToView');
        
        // Make request to backend
        const response = await fetch(appConfig.apiEndpoint('/user-profile'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ username: profileToLoad }),
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load profile data');
        }
        
        const data = await response.json();
        currentUserData = data.user;
        
        // Determine if this is the current user's profile
        isCurrentUserProfile = currentUsername === currentUserData.Username;
        
        // Check which page user came from
        const profileOrigin = sessionStorage.getItem('profileOrigin');
        
        // Show modify button only if it's the current user's profile AND they came from games page
        const canModify = isCurrentUserProfile && profileOrigin === 'games';
        document.getElementById('modifyButtonContainer').style.display = 
            canModify ? 'flex' : 'none';
            
        // Update UI with profile data
        updateProfileUI(currentUserData);
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showStatusMessage('Error loading profile data', 'error');
    }
}

// Update profile UI with data
function updateProfileUI(userData) {
    // View mode elements
    document.getElementById('username').textContent = userData.Username;
    document.getElementById('userBio').textContent = userData.Bio || 'No bio provided';
    document.getElementById('userSong').textContent = userData.Favorite_song || 'No favorite song provided';
    
    // Profile picture
    if (userData.Profile_picture) {
        const imgSrc = `data:image/png;base64,${userData.Profile_picture}`;
        document.getElementById('profilePicture').src = imgSrc;
        originalImageData = imgSrc;
    } else {
        document.getElementById('profilePicture').src = 'profile_pictures/default.jpg';
    }
    
    // Edit mode elements
    document.getElementById('editUsername').textContent = userData.Username;
    document.getElementById('editBio').value = userData.Bio || '';
    document.getElementById('editSong').value = userData.Favorite_song || '';
    document.getElementById('editProfilePicture').src = document.getElementById('profilePicture').src;
}

// Switch to edit mode
function switchToEditMode() {
    // Check which page user came from
    const profileOrigin = sessionStorage.getItem('profileOrigin');
    
    if (!isCurrentUserProfile || profileOrigin !== 'games') {
        showStatusMessage('You cannot edit this profile', 'error');
        return;
    }
    
    isEditMode = true;
    document.getElementById('viewMode').classList.add('hidden');
    document.getElementById('editMode').classList.remove('hidden');
    
    // Reset image data when entering edit mode
    newImageData = null;
}

// Handle profile picture change
function handleProfilePictureChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        // Store new image data and update preview
        newImageData = e.target.result;
        document.getElementById('editProfilePicture').src = newImageData;
    };
    reader.readAsDataURL(file);
}

// Save profile changes
async function saveProfileChanges() {
    try {
        const updatedProfile = {
            username: currentUserData.Username,
            bio: document.getElementById('editBio').value,
            favoriteSong: document.getElementById('editSong').value,
            profilePicture: newImageData || undefined // Only include if changed
        };
        
        // Make request to backend
        const response = await fetch(appConfig.apiEndpoint('/update-profile'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(updatedProfile),
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to update profile');
        }
        
        const data = await response.json();
        
        // Update current user data with the response
        currentUserData = data.user;
        
        // Switch back to view mode and update UI
        switchToViewMode();
        updateProfileUI(currentUserData);
        
        showStatusMessage('Profile updated successfully', 'success');
    } catch (error) {
        console.error('Error updating profile:', error);
        showStatusMessage('Error updating profile', 'error');
    }
}

// Cancel editing and return to view mode
function cancelEditing() {
    // Discard changes and switch back to view mode
    switchToViewMode();
    
    // Reset the file input
    document.getElementById('profilePictureUpload').value = '';
}

// Switch to view mode
function switchToViewMode() {
    isEditMode = false;
    document.getElementById('editMode').classList.add('hidden');
    document.getElementById('viewMode').classList.remove('hidden');
}

// Show status message
function showStatusMessage(message, type = 'info') {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = `status-message show ${type}`;
    
    // Hide after 3 seconds
    setTimeout(() => {
        statusMessage.classList.remove('show');
    }, 3000);
}

// Go back to game
function goBackToGame() {
    // Set navigation flags for websocket handling
    sessionStorage.setItem('intentionalNavigation', 'true');
    sessionStorage.setItem('wsWasOpen', 'true');
    
    // Check if we came from a game page or games lobby
    const gameId = sessionStorage.getItem('currentGameId');
    if (gameId) {
        // Return to active game
        setTimeout(() => {
            globalThis.location.href = 'index.html';
        }, 10);
    } else {
        // Return to games lobby
        setTimeout(() => {
            globalThis.location.href = 'games.html';
        }, 10);
    }
}

function goBackToGame() {
    // Set navigation flags for websocket handling
    sessionStorage.setItem('intentionalNavigation', 'true');
    sessionStorage.setItem('wsWasOpen', 'true');
    
    // Check which page user came from
    const profileOrigin = sessionStorage.getItem('profileOrigin');
    
    // Determine where to go back to
    if (profileOrigin === 'index') {
        // Return to the game
        setTimeout(() => {
            globalThis.location.href = 'index.html';
        }, 10);
    } else {
        // Return to games lobby by default
        setTimeout(() => {
            globalThis.location.href = 'games.html';
        }, 10);
    }
}