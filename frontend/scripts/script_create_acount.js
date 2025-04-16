function createAccount() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm_password").value;
    const errorMessage = document.getElementById("error-message");
    const profilePicture = document.querySelector('input[name="profile_picture"]:checked').value;

    if (password !== confirmPassword) {
        errorMessage.textContent = "Passwords do not match!";
        errorMessage.style.display = "block";
        return;
    }

    // Proceed with account creation
    fetch("http://localhost:3000/create_account", {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: username, password: password, profilePicture: profilePicture })
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error("Failed to create account.");
        }
    })
    .then(data => {
        alert("Account created successfully!");
        globalThis.location.href = "../index.html";
    })
    .catch(error => {
        console.error(error);
    });
}