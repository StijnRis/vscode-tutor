import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    const provider = new ColorsViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ColorsViewProvider.viewType,
            provider
        )
    );
}

class ColorsViewProvider implements vscode.WebviewViewProvider {
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
                ["read:user"],
                { createIfNone: true }
            );
            const verifyResponse = await fetch(
                "http://localhost:3000/verify-token",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ token: session.accessToken }),
                }
            );

            if (!verifyResponse.ok) {
                throw new Error("Token verification failed");
            }

            const response = await fetch(
                "https://jsonplaceholder.typicode.com/posts/1",
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.accessToken}`,
                    },
                }
            );
            const data = (await response.json()) as any;
            return data.title;
        } catch (error) {
            console.error("Error:", error);
            throw error;
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
                    <input id="message-input" type="text" placeholder="Type a message...">
                    <button id="send-button">Send</button>
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
