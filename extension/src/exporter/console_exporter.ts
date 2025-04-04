import { TutorEvent } from "../tutor_event";
import { Exporter } from "./exporter";

export class ConsoleExporter implements Exporter {
    public export(event: TutorEvent): void {
        console.log("Exported Event:", JSON.stringify(event, null, 2));
    }
}
