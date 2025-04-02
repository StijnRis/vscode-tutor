import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Exporter } from "./exporter/exporter";
import { FileExporter } from "./exporter/file_exporter";
import { DocumentCloseEventProducer } from "./producer/document_close_event_producer";
import { DocumentOpenEventProducer } from "./producer/document_open_event_producer";
import { DocumentSaveEventProducer } from "./producer/document_save_event_producer";
import { EventProducer } from "./producer/event_producer";
import { ExecuteCommandEventProducer } from "./producer/execute_command_event_producer";

const output = vscode.window.createOutputChannel("Tutor");

export async function activate(context: vscode.ExtensionContext) {
    output.appendLine("Activating Tutor extension");

    const { accessToken, username } = await setupSession();
    if (!accessToken) {
        return;
    }

    output.appendLine(`Username found: ${username}`);

    // Create producers
    const producers: EventProducer[] = [];
    producers.push(new ExecuteCommandEventProducer(output, username));
    producers.push(new DocumentCloseEventProducer(output, username));
    producers.push(new DocumentOpenEventProducer(output, username));
    producers.push(new DocumentSaveEventProducer(output, username));

    // Create exporters
    const exporters: Exporter[] = [];
    exporters.push(FileExporter.create(username, output));

    // Link producers and exporters
    for (const producer of producers) {
        for (const exporter of exporters) {
            producer.add_exporter(exporter);
        }
    }

    // Listen to events
    for (const producer of producers) {
        producer.listen(context);
    }

    // Register chat view
    const provider = new ChatViewProvider(context.extensionUri, accessToken, username);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );

    vscode.window.showInformationMessage(
        `Logging of events is enabled for research purposes.`
    );

    output.appendLine(`Fully activated Tutor extension`);
}

export async function deactivate() {
    output.appendLine("Deactivating Tutor extension");
}

async function setupSession() {
    let session: vscode.AuthenticationSession | undefined | null = null;
    try {
        session = await vscode.authentication.getSession("github", [
            "read:user",
            "user:email",
        ]);
    } catch (error) {
        output.appendLine("Error during authentication: " + error);
    }

    if (!session) {
        vscode.window.showInformationMessage(
            "In the next popup, please log in to your GitHub account so we can retrieve your email address. We require it to prevent unauthorized access to the chatbot.",
            { modal: true }
        );
        try {
            session = await vscode.authentication.getSession(
                "github",
                ["read:user", "user:email"],
                { createIfNone: true }
            );
        } catch (error) {
            output.appendLine("Error during authentication: " + error);
        }
    }

    if (!session) {
        const retry = await vscode.window.showInformationMessage(
            "Failed to authenticate with GitHub. Do you want to retry?",
            { modal: true },
            { title: "Yes", isCloseAffordance: false },
            { title: "No", isCloseAffordance: true }
        );
        if (retry && !retry.isCloseAffordance) {
            return await setupSession();
        }
        return {
            accessToken: null,
            username: "Unknown",
        };
    }

    const response = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${session.accessToken}`,
            "User-Agent": "vscode-extension",
        },
    });
    const data = (await response.json()) as any;
    return {
        accessToken: session.accessToken,
        username: data.login,
    };
}

type ChatMessage = {
    message: string;
    isUserMessage: boolean;
    timestamp: string;
};

class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "tutor.chat";

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly accessToken: string | null,
        private readonly username: string
    ) {}

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
                case "sendMessage":
                    this.saveMessageToFile(message.text, true);
                    const response = await this.getResponse(message.text);
                    webviewView.webview.postMessage({
                        command: "response",
                        text: response,
                    });
                    break;

                case "loadConversation":
                    const conversation = this.loadConversationFromFile();
                    webviewView.webview.postMessage({
                        command: "loadConversation",
                        conversation: conversation,
                    });
                    break;
            }
        });
    }

    private async getResponse(message: string): Promise<string> {
        try {
            const response = await fetch("http://localhost:8501/chat/message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.accessToken}`,
                },
                body: JSON.stringify({ message: message }),
            });
            output.appendLine(`Response: ${response}`);

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            const data = (await response.json()) as any;
            const chatResponse = data.chatResponse;
            this.saveMessageToFile(chatResponse, false);
            return chatResponse;
        } catch (error) {
            console.error("Error:", error);
            return "An error occurred: " + error;
        }
    }

    private saveMessageToFile(message: string, isUserMessage: boolean) {
        const chatFilePath = this.getChatFilePath();
        let chatData: ChatMessage[] = [];
        if (fs.existsSync(chatFilePath)) {
            chatData = JSON.parse(fs.readFileSync(chatFilePath, "utf-8"));
        }
        chatData.push({
            message: message,
            isUserMessage: isUserMessage,
            timestamp: new Date().toISOString(),
        });
        fs.writeFileSync(chatFilePath, JSON.stringify(chatData, null, 2));
    }

    private loadConversationFromFile(): ChatMessage[] {
        const chatFilePath = this.getChatFilePath();
        if (fs.existsSync(chatFilePath)) {
            return JSON.parse(fs.readFileSync(chatFilePath, "utf-8"));
        }
        return [];
    }

    private getChatFilePath(): string {
        const telemetryDir = path.join(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
            ".data",
            this.username,
            vscode.env.machineId,
            vscode.env.sessionId
        );
        if (!fs.existsSync(telemetryDir)) {
            fs.mkdirSync(telemetryDir, { recursive: true });
        }
        return path.join(telemetryDir, "chat.json");
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
