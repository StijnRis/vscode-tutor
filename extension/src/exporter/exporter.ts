import { TutorEvent } from "../tutor_event";

export interface Exporter {
    export(data: TutorEvent): void;
}
