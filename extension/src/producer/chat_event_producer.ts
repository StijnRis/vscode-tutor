import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";
import { TutorEvent } from "../tutor_event";
import { EventProducer } from "./event_producer";

export class ChatEventProducer implements EventProducer {
    private exporters: Exporter[];

    constructor(
        private readonly output: vscode.OutputChannel,
        private readonly username: string
    ) {
        this.exporters = [];
    }

    public listen(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand("tutor.chatMessage", (message) =>
                this.chatMessageEventHandler(message)
            )
        );
    }

    public add_exporter(exporter: Exporter) {
        this.exporters.push(exporter);
    }

    private chatMessageEventHandler(message: {
        message: string;
        isUserMessage: boolean;
        timestamp: string;
    }) {
        const event: TutorEvent = {
            eventType: "chatMessage",
            timestamp: message.timestamp,
            sessionId: vscode.env.sessionId,
            machineId: vscode.env.machineId,
            githubUsername: this.username,
            data: {
                message: message.message,
                isUserMessage: message.isUserMessage,
            },
        };
        this.output.appendLine(`Event: chat message`);
        for (const exporter of this.exporters) {
            exporter.export(event);
        }
    }
}
