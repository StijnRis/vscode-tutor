import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";
import { isInDataDirectory } from "../extension";
import { TutorEvent } from "../tutor_event";

export class FileSystemEventProducer {
    private output: vscode.OutputChannel;
    private exporters: Exporter[];
    private githubUsername: string;

    constructor(output: vscode.OutputChannel, githubUsername: string) {
        this.output = output;
        this.exporters = [];
        this.githubUsername = githubUsername;
    }

    listen(context: vscode.ExtensionContext) {
        const fileSystemWatcher =
            vscode.workspace.createFileSystemWatcher("**/*");

        fileSystemWatcher.onDidCreate((uri) =>
            this.fileCreatedEventHandler(uri)
        );
        fileSystemWatcher.onDidDelete((uri) =>
            this.fileDeletedEventHandler(uri)
        );

        context.subscriptions.push(fileSystemWatcher);
    }

    add_exporter(exporter: Exporter) {
        this.exporters.push(exporter);
    }

    private async fileCreatedEventHandler(uri: vscode.Uri) {
        if (isInDataDirectory(uri.fsPath)) {
            this.output.appendLine(
                `Skipping event for file in .data directory: ${uri.fsPath}`
            );
            return;
        }

        this.output.appendLine(`Event: File created: ${uri.fsPath}`);

        const data: TutorEvent = {
            eventType: "file_created",
            timestamp: new Date().toISOString(),
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.githubUsername,
            data: {
                filePath: uri.fsPath,
            },
        };

        for (const exporter of this.exporters) {
            exporter.export(data);
        }
    }

    private async fileDeletedEventHandler(uri: vscode.Uri) {
        if (isInDataDirectory(uri.fsPath)) {
            this.output.appendLine(
                `Skipping event for file in .data directory: ${uri.fsPath}`
            );
            return;
        }

        this.output.appendLine(`Event: File deleted: ${uri.fsPath}`);

        const data: TutorEvent = {
            eventType: "file_deleted",
            timestamp: new Date().toISOString(),
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.githubUsername,
            data: {
                filePath: uri.fsPath,
            },
        };

        for (const exporter of this.exporters) {
            exporter.export(data);
        }
    }
}
