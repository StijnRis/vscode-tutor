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
        const terminal = event.terminal;
        const command = event.execution.commandLine.value;
        this.output.appendLine(
            `Saving execution of terminal '${terminal.name}' with command: ${command}`
        );

        let result = "";
        const stream = event.execution.read();
        for await (const data of stream) {
            result += data;
        }

        const shortenedResult =
            result.replace(/\r?\n|\r/g, "").length > 14
                ? `${result.replace(/\r?\n|\r/g, "").slice(0, 7)}...${result
                      .replace(/\r?\n|\r/g, "")
                      .slice(-7)}`
                : result.replace(/\r?\n|\r/g, "");
        this.output.appendLine(`Terminal output found: '${shortenedResult}'`);

        const data: TutorEvent = {
            eventType: "execution",
            timestamp: new Date().toISOString(),
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.githubUsername,
            data: {
                exitStatus: event.terminal.exitStatus,
                command: command,
                result: result,
            },
        };

        for (const exporter of this.exporters) {
            exporter.export(data);
        }
    }
}
