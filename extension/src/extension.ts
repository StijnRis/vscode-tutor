import * as path from "path";
import * as vscode from "vscode";
import { Exporter } from "./exporter/exporter";
import { RemoteExporter } from "./exporter/remote_exporter";
import { ChatEventProducer } from "./producer/chat_event_producer";
import { DocumentCloseEventProducer } from "./producer/document_close_event_producer";
import { DocumentOpenEventProducer } from "./producer/document_open_event_producer";
import { DocumentSaveEventProducer } from "./producer/document_save_event_producer";
import { EditorFileSwitchEventProducer } from "./producer/editor_file_switch_event_producer";
import { EventProducer } from "./producer/event_producer";
import { ExecuteCommandEventProducer } from "./producer/execute_command_event_producer";
import { FileSystemEventProducer } from "./producer/file_system_event_producer";
import { KeystrokeEventProducer } from "./producer/keystroke_event_producer";

const baseUrl = "https://python-stanislas.ewi.tudelft.nl/vs-tutor";
// const baseUrl = "http://localhost:8501";
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
    producers.push(new EditorFileSwitchEventProducer(output, username));
    producers.push(new FileSystemEventProducer(output, username));
    producers.push(new ChatEventProducer(output, username));
    producers.push(new KeystrokeEventProducer(output, username));

    // Create exporters
    const exporters: Exporter[] = [];
    // exporters.push(FileExporter.create(username, output));
    // exporters.push(new ConsoleExporter());
    exporters.push(
        new RemoteExporter(
            `${baseUrl}/tutor/event`,
            accessToken,
            username,
            output
        )
    );

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
    const provider = new ChatViewProvider(
        context.extensionUri,
        accessToken,
        username,
        output
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );

    vscode.window.showInformationMessage(
        `Click the chat icon in the left sidebar to open the chat.\n\nEvent logging is enabled for research purposes.`,
        { modal: true }
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

export function isInDataDirectory(filePath: string): boolean {
    const dataDir = path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
        ".data"
    );
    return filePath.startsWith(dataDir);
}

type ChatMessage = {
    message: string;
    isUserMessage: boolean;
    timestamp: string;
};

class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "tutor.chat";

    private _view?: vscode.WebviewView;
    private chatMessages: ChatMessage[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly accessToken: string | null,
        private readonly username: string,
        private readonly output: vscode.OutputChannel
    ) {
        this.chatMessages = [];
    }

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
                    this.saveMessageToArray(message.text, true);
                    const response = await this.getResponseToLatestMessage();
                    this.saveMessageToArray(response, false);
                    webviewView.webview.postMessage({
                        command: "response",
                        text: response,
                    });
                    break;

                case "loadChatMessages":
                    webviewView.webview.postMessage({
                        command: "loadChatMessages",
                        chatMessages: this.chatMessages,
                    });
                    break;
            }
        });
    }

    private async getResponseToLatestMessage(): Promise<string> {
        try {
            const messages = [];
            for (const message of this.chatMessages) {
                if (message.isUserMessage) {
                    messages.push({ role: "user", content: message.message });
                } else {
                    messages.push({
                        role: "assistant",
                        content: message.message,
                    });
                }
            }

            const response = await fetch(`${baseUrl}/tutor/message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.accessToken}`,
                },
                body: JSON.stringify({ messages: messages }),
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            const data = (await response.json()) as any;
            const chatResponse = data.chatResponse;
            return chatResponse;
        } catch (error) {
            this.output.appendLine(`Chat response error: ${error}`);
            return `An error occurred: ${error}`;
        }
    }

    private saveMessageToArray(message: string, isUserMessage: boolean) {
        this.chatMessages.push({
            message: message,
            isUserMessage: isUserMessage,
            timestamp: new Date().toISOString(),
        });
        vscode.commands.executeCommand("tutor.chatMessage", {
            message,
            isUserMessage,
            timestamp: new Date().toISOString(),
        });
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
                    <button id="send-button"><svg class="" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="SendIcon"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" fill="#777778"></path></svg></button>
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
