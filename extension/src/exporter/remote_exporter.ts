import * as vscode from "vscode";
import { Exporter } from "./exporter";

import { TutorEvent } from "../tutor_event";

export class RemoteExporter implements Exporter {
    private url: string;
    private output: vscode.OutputChannel;
    private username: string;


    constructor(url: string, username: string, output: vscode.OutputChannel) {
        output.appendLine(`Exporting data to url: ${url}`);
        this.url = url;
        this.output = output;
        this.username = username;
    }

    export(event: TutorEvent) {
        const data = {
            username: this.username,
            machineId: vscode.env.machineId,
            sessionId: vscode.env.sessionId,
            event: event,
        }
        const options = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        };

        fetch(this.url, options)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok ${response.statusText}`);
                }
                return response.json();
            })
            .then((data) => {
                this.output.appendLine(`Data exported successfully`);
            })
            .catch((error) => {
                this.output.appendLine(`Error exporting data`);
            });
    }
}
