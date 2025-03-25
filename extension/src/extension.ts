import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const userName = require("os").userInfo().username;

export function activate(context: vscode.ExtensionContext) {
    console.log("Activating Tutor extension");
    const provider = new ChatViewProvider(context.extensionUri);

    const userFolderPath = setupFolder(userName);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );
    context.subscriptions.push(
        vscode.window.onDidEndTerminalShellExecution(event => {
            const terminal = event.terminal;
            console.log(`Terminal '${terminal.name}' finished execution.`);
            saveTerminalResults(userFolderPath)
        })
    );
}

export function setupFolder(user: string) {
    const dataFolderPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', '.data');
    if (!fs.existsSync(dataFolderPath)) {
        fs.mkdirSync(dataFolderPath);
        console.log(`Created .data folder at: ${dataFolderPath}`);
    } else {
        console.log(`.data folder already exists at: ${dataFolderPath}`);
    }

    const userFolderPath = path.join(dataFolderPath, user);
    if (!fs.existsSync(userFolderPath)) {
        fs.mkdirSync(userFolderPath);
        console.log(`Created user folder at: ${userFolderPath}`);
    } else {
        console.log(`User folder already exists at: ${userFolderPath}`);
    }

    return userFolderPath
}

async function saveTerminalResults(userFolderPath: string) {
    // Save the original clipboard content
    const originalClipboardContent = await vscode.env.clipboard.readText();

    // Select all text in the terminal
    await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
    
    // Copy the selected text from the terminal
    await vscode.commands.executeCommand('workbench.action.terminal.copySelection');

    // Clear selection
    await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');
    
    // Retrieve the copied content from the clipboard
    const clipboardContent = await vscode.env.clipboard.readText();

    // Restore the original clipboard content
    await vscode.env.clipboard.writeText(originalClipboardContent);

    // Get most recent program execution
    const program = clipboardContent.split('\nPS').slice(-2, -1)[0];

    // Save the copied content to a file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(userFolderPath, `terminal-output-${timestamp}.txt`);
    fs.writeFileSync(filePath, program);
    console.log('Terminal output saved to:', filePath);
}

class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "tutor.chat";

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case "getResponse":
                    const response = await this.getResponse(message.text);
                    webviewView.webview.postMessage({
                        command: "response",
                        text: response,
                    });
                    break;
            }
        });
    }

    private async getResponse(message: string): Promise<string> {
        try {
            const session = await vscode.authentication.getSession(
                "github",
                ["read:user", "user:email"],
                { createIfNone: true }
            );
            const response = await fetch("http://localhost:3000/chat/message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify({ message: message }),
            });
            console.log("Response:", response);

            if (!response.ok) {
                throw new Error("Token verification failed");
            }

            const data = (await response.json()) as any;
            return data.chatResponse;
        } catch (error) {
            console.error("Error:", error);
            return "An error occurred: " + error;
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
        );

        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
        );
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "main.css")
        );

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">

            <!--
                Use a content security policy to only allow loading styles from our extension directory,
                and only allow scripts that have a specific nonce.
                (See the 'webview-sample' extension sample for img-src content security policy examples)
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link href="${styleResetUri}" rel="stylesheet">
            <link href="${styleVSCodeUri}" rel="stylesheet">
            <link href="${styleMainUri}" rel="stylesheet">

            <title>Tutor chat</title>
            </head>
            <body>

            <div id="chat">
                <div id="messages"></div>
                <div id="input-container">
                    <textarea id="message-input" placeholder="Type a message..."></textarea>
                    <button id="send-button"><svg class="" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="SendIcon"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" fill="white"></path></svg></button>
                </div>
            </div>

            <script nonce="${nonce}" src="${scriptUri}"></script>
            
            </body>
        </html>`;
    }
}

function getNonce() {
    let text = "";
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
