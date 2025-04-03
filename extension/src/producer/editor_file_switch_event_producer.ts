import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";
import { isInDataDirectory } from "../extension";
import { TutorEvent } from "../tutor_event";

export class EditorFileSwitchEventProducer {
    private output: vscode.OutputChannel;
    private exporters: Exporter[];
    private githubUsername: string;

    constructor(output: vscode.OutputChannel, githubUsername: string) {
        this.output = output;
        this.exporters = [];
        this.githubUsername = githubUsername;
    }

    listen(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.editorFileSwitchEventHandler(editor.document);
                }
            })
        );
    }

    add_exporter(exporter: Exporter) {
        this.exporters.push(exporter);
    }

    async editorFileSwitchEventHandler(document: vscode.TextDocument) {
        if (isInDataDirectory(document.fileName)) {
            this.output.appendLine(
                `Skipping event for file in .data directory: ${document.fileName}`
            );
            return;
        }

        this.output.appendLine(`Event: Switched to file: ${document.fileName}`);

        const data: TutorEvent = {
            eventType: "editor_file_switch",
            timestamp: new Date().toISOString(),
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.githubUsername,
            data: {
                documentPath: document.fileName,
            },
        };

        for (const exporter of this.exporters) {
            exporter.export(data);
        }
    }
}
