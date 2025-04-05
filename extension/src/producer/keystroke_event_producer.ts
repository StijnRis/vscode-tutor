import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";
import { EventProducer } from "./event_producer";

export class KeystrokeEventProducer implements EventProducer {
    private readonly exporters: Exporter[];

    constructor(
        private readonly output: vscode.OutputChannel,
        private readonly username: string
    ) {
        this.exporters = [];
    }

    add_exporter(exporter: Exporter) {
        this.exporters.push(exporter);
    }

    listen(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (event.document.uri.scheme !== "file") {
                    return;
                }

                const changes = event.contentChanges.map((change) => ({
                    text: change.text,
                    rangeLength: change.rangeLength,
                    rangeOffset: change.rangeOffset,
                }));

                if (changes.length === 0) {
                    return;
                }

                const eventData = {
                    eventType: "keystroke",
                    sessionId: vscode.env.sessionId,
                    machineId: vscode.env.machineId,
                    githubUsername: this.username,
                    documentUri: event.document.uri.toString(),
                    timestamp: new Date().toISOString(),
                    data: {
                        documentPath: event.document.fileName,
                        changes: changes,
                    },
                };

                this.output.appendLine(
                    `Keystroke event`
                );

                this.exporters.forEach((exporter: Exporter) =>
                    exporter.export(eventData)
                );
            })
        );
    }
}
