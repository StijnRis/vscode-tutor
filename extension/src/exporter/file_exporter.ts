import * as fs from "fs";
import * as vscode from "vscode";
import { Exporter } from "./exporter";

import * as path from "path";
import { TutorEvent } from "../tutor_event";

export class FileExporter implements Exporter {
    private filePath: string;
    private output: vscode.OutputChannel;

    static create(
        username: string,
        output: vscode.OutputChannel
    ): FileExporter {
        const dirPath = path.join(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
            ".data",
            username,
            vscode.env.machineId,
            vscode.env.sessionId
        );
        
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            output.appendLine(`Created session file at: ${dirPath}`);
        } else {
            output.appendLine(`Session file already exists at: ${dirPath}`);
        }

        const filePath = path.join(dirPath, "telemetry.json");
    
        return new FileExporter(filePath, output);
    }

    constructor(filePath: string, output: vscode.OutputChannel) {
        output.appendLine(`Exporting data to file: ${filePath}`);
        this.filePath = filePath;
        this.output = output;
    }

    export(event: TutorEvent) {
        fs.appendFileSync(this.filePath, JSON.stringify(event, null, 2) + ",\n");

        this.output.appendLine(`Exported event to: ${this.filePath}`);
    }
}
