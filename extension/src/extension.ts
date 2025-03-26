import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const output = vscode.window.createOutputChannel("Tutor");

const session = vscode.authentication.getSession(
    "github",
    ["read:user", "user:email"],
    { createIfNone: true }
);

const userName = getUserName();

export async function activate(context: vscode.ExtensionContext) {
    output.appendLine("Activating Tutor extension");
    output.appendLine(`Username found: ${await userName}`);

    vscode.window.showInformationMessage(
        `Telemetry logging to a local file is enabled for research purposes.`
    );

    const userFolderPath = setupFolder(await userName);

    const provider = new ChatViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );
    context.subscriptions.push(
        vscode.window.onDidStartTerminalShellExecution(async (event) => {
            saveExecutionEvent(userFolderPath, event);
        })
    );
}

export async function deactivate() {
    output.appendLine("Deactivating Tutor extension");
}

async function getUserName() {
    const response = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${(await session).accessToken}`,
            "User-Agent": "vscode-extension",
        },
    });
    const data = (await response.json()) as any;
    return data.login;
}

function setupFolder(user: string) {
    const dataFolderPath = path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
        ".data"
    );
    if (!fs.existsSync(dataFolderPath)) {
        fs.mkdirSync(dataFolderPath);
        output.appendLine(`Created .data folder at: ${dataFolderPath}`);
    } else {
        output.appendLine(`.data folder already exists at: ${dataFolderPath}`);
    }

    const userFolderPath = path.join(dataFolderPath, user, vscode.env.machineId, vscode.env.sessionId);
    if (!fs.existsSync(userFolderPath)) {
        fs.mkdirSync(userFolderPath, { recursive: true });
        output.appendLine(`Created session folder at: ${userFolderPath}`);
    } else {
        output.appendLine(`User session already exists at: ${userFolderPath}`);
    }

    return userFolderPath;
}

async function saveExecutionEvent(
    userFolderPath: string,
    event: vscode.TerminalShellExecutionStartEvent
) {
    const terminal = event.terminal;
    const command = event.execution.commandLine.value;
    output.appendLine(
        `Terminal '${terminal.name}' started executing command: ${command}`
    );

    let result = "";
    const stream = event.execution.read()
    for await (const data of stream) {
        result += data;
    }

    const shortenedResult =
        result.replace(/\r?\n|\r/g, "").length > 14
            ? `${result.replace(/\r?\n|\r/g, "").slice(0, 7)}...${result
                  .replace(/\r?\n|\r/g, "")
                  .slice(-7)}`
            : result.replace(/\r?\n|\r/g, "");
    output.appendLine(`Terminal output found: '${shortenedResult}'`);

    
    const data = {
        eventType: "execution",
        timestamp: new Date().toISOString(),
        sessionId: vscode.env.sessionId,
        machineId: vscode.env.machineId,
        githubUsername: await userName,
        exitStatus: event.terminal.exitStatus,
        command: command,
        result: result,
    };

    const filePath = path.join(userFolderPath, "telemetry.json");
    fs.appendFileSync(filePath, JSON.stringify(data, null, 2) + ",\n");

    output.appendLine(`Terminal output saved to: ${filePath}`);
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
            const response = await fetch("http://localhost:3000/chat/message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${(await session).accessToken}`,
                },
                body: JSON.stringify({ message: message }),
            });
            output.appendLine(`Response: ${response}`);

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
