import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";
import { isInDataDirectory } from "../extension";
import { TutorEvent } from "../tutor_event";

export class DocumentOpenEventProducer {
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
            vscode.workspace.onDidOpenTextDocument(async (event) => {
                this.documentOpenEventHandler(event);
            })
        );
    }

    add_exporter(exporter: Exporter) {
        this.exporters.push(exporter);
    }

    private async documentOpenEventHandler(document: vscode.TextDocument) {
        if (isInDataDirectory(document.fileName)) {
            this.output.appendLine(
                `Skipping event for file in .data directory: ${document.fileName}`
            );
            return;
        }

        this.output.appendLine(`Event: Document opened: ${document.fileName}`);

        const data: TutorEvent = {
            eventType: "documentOpen",
            timestamp: new Date().toISOString(),
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.githubUsername,
            data: {
                documentPath: document.fileName,
                documentText: document.getText(),
            },
        };

        for (const exporter of this.exporters) {
            exporter.export(data);
        }
    }
}
