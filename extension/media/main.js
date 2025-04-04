// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const messagesDiv = document.getElementById("messages");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");

    // Load chatMessages from chat.json
    vscode.postMessage({ command: "loadChatMessages" });

    sendButton.addEventListener("click", () => {
        const message = messageInput.value;
        if (message) {
            const messageElement = document.createElement("div");
            messageElement.className = "message user-message";
            messageElement.textContent = "You: " + message;
            messagesDiv.appendChild(messageElement);

            const loadingElement = document.createElement("div");
            loadingElement.className = "message bot-message";
            loadingElement.textContent = "loading...";
            messagesDiv.appendChild(loadingElement);

            vscode.postMessage({ command: "sendMessage", text: message });

            // Clear the text field
            messageInput.value = "";
        }
    });

    window.addEventListener("message", (event) => {
        const message = event.data;
        switch (message.command) {
            case "response":
                const loadingElement =
                    messagesDiv.querySelector("div:last-child");
                loadingElement.innerHTML = message.text;

                break;

            case "loadChatMessages":
                const chatMessages = message.chatMessages || [];
                chatMessages.forEach((msg) => {
                    const messageElement = document.createElement("div");
                    messageElement.className =
                        "message " +
                        (msg["isUserMessage"] ? "user-message" : "bot-message");
                    let message = msg["message"];
                    if (msg["isUserMessage"]) {
                        message = "You: " + message;
                    }
                    messageElement.innerHTML = message;
                    messagesDiv.appendChild(messageElement);
                });
                break;
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        const textarea = document.getElementById("message-input");

        textarea.addEventListener("input", function () {
            this.style.height = "auto"; // Reset height to recalculate
            this.style.height = Math.min(this.scrollHeight, 200) + "px"; // Adjust height based on scroll height
        });
    });
})();
