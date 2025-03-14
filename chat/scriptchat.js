const chat = document.getElementById('messageInput');
const userList = document.getElementById('userList');

const ws = new WebSocket(`ws://localhost:3000`);

function sendJson() {
    event.preventDefault(); // Prevent default form submission
    const message = chat.value;
    const data = { auth_token: localStorage.auth_token, message: message };
    ws.send(JSON.stringify(data));
    chat.value = "";
}

function goToLogin() {
    location.href = "/login.html";
}


function requestUsersProfile() {
    const data = { auth_token: localStorage.auth_token, type: "connected_users" };
    ws.send(JSON.stringify(data));
}

chat.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        sendJson();
    }
});

/****************************************************************/
/************************* WEBSOCKET ****************************/
/****************************************************************/

ws.onopen = function() {
    console.log('WebSocket connection established.');
    requestUsersProfile(); // Request to get user profile when the connection is established
};

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('WebSocket message received:', data.type);
    console.log(data);
    if (data.type == "message") {
        const message = JSON.parse(event.data);
        const messageBox = document.createElement("div");
        messageBox.className = "message-box";

        const userPicture = document.createElement("img");
        userPicture.src = message.user_pp_path;
        userPicture.alt = "User Picture";
        userPicture.className = "user-picture";

        const messageContent = document.createElement("div");
        messageContent.className = "message-content";

        const userName = document.createElement("strong");
        userName.className = "user-name";
        userName.textContent = `${message.owner}:`;

        const messageText = document.createElement("span");
        messageText.className = "message-text";
        messageText.textContent = message.message;

        messageContent.appendChild(userName);
        messageContent.appendChild(messageText);
        messageBox.appendChild(userPicture);
        messageBox.appendChild(messageContent);

        // Vérifie si c'est un message de l'utilisateur actuel
        const currentUser = localStorage.getItem("username"); // Assure-toi que l'username est stocké lors du login
        if (message.owner === currentUser) {
            messageBox.classList.add("my-message");
        } else {
            messageBox.classList.add("other-message");
        }

        document.getElementById('messages').appendChild(messageBox);
    }
    if (data.type == "connected_users") {
        const users = data.users;
        const profileContainer = document.getElementById('profiles');
        profileContainer.innerHTML = ''; // Clear existing profiles

        users.forEach(user => {
            console.log(user)
            const profileBox = document.createElement("div");
            profileBox.className = "profile-box";

            const profilePicture = document.createElement("img");
            profilePicture.src = user.pp_path;
            profilePicture.alt = "Profile Picture";
            profilePicture.className = "profile-picture";

            const profileName = document.createElement("div");
            profileName.className = "profile-name";
            profileName.textContent = user.username;

            profileBox.appendChild(profilePicture);
            profileBox.appendChild(profileName);
            profileContainer.appendChild(profileBox);
        });
    }
};

ws.onerror = function(error) {
    console.error('WebSocket error:', error);
    goToLogin();
};

ws.onclose = function(event) {
    console.log('WebSocket connection closed:', event);
    goToLogin();
};
