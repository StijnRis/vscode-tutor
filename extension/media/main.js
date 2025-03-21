
// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const messagesDiv = document.getElementById("messages");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");

    sendButton.addEventListener("click", () => {
        const message = messageInput.value;
        if (message) {
            const messageElement = document.createElement("div");
            messageElement.className = "message";
            messageElement.textContent = "You: " + message;
            messagesDiv.appendChild(messageElement);

            const loadingElement = document.createElement("div");
            loadingElement.className = "message";
            loadingElement.textContent = "loading...";
            messagesDiv.appendChild(loadingElement);

            vscode.postMessage({ command: "getResponse", text: message });

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
        }
    });
})();
