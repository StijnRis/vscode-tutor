import * as vscode from "vscode";
import { Exporter } from "../exporter/exporter";

export interface EventProducer {
    listen(context: vscode.ExtensionContext): void;
    add_exporter(exporter: Exporter): void;
}
