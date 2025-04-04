import * as vscode from "vscode";
import { TutorEvent } from "../tutor_event";
import { Exporter } from "./exporter";

export class RemoteExporter implements Exporter {
    constructor(
        private readonly endpoint: string,
        private readonly accessToken: string | null,
        private readonly username: string,
        private readonly output: vscode.OutputChannel
    ) {}

    public async export(event: TutorEvent): Promise<void> {
        const data = {
            username: this.username,
            event: event,
        };
        try {
            const response = await fetch(this.endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.accessToken}`,
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to export event. Status: ${response.status}, Message: ${response.statusText}`
                );
            }
        } catch (error) {
            this.output.appendLine(`Error exporting event: ${error}`);
        }
    }
}
