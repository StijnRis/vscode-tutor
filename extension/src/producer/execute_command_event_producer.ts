import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";
import { TutorEvent } from "../tutor_event";

export class ExecuteCommandEventProducer {
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
            vscode.window.onDidStartTerminalShellExecution(async (event) => {
                this.executionEventHandler(event);
            })
        );
    }

    add_exporter(exporter: Exporter) {
        this.exporters.push(exporter);
    }

    async executionEventHandler(
        event: vscode.TerminalShellExecutionStartEvent
    ) {
        const startTime = new Date();

        const terminal = event.terminal;
        const command = event.execution.commandLine.value;
        this.output.appendLine(
            `Event: Terminal '${terminal.name}' executed ${command}`
        );

        let result = "";
        const stream = event.execution.read();
        for await (const data of stream) {
            result += data;
        }

        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        const data: TutorEvent = {
            eventType: "execution",
            timestamp: new Date().toISOString(),
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.githubUsername,
            data: {
                exitStatus: event.terminal.exitStatus,
                command: command,
                durationMs: duration,
                result: result,
            },
        };

        for (const exporter of this.exporters) {
            exporter.export(data);
        }
    }
}
