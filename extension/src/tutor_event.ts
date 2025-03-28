export type TutorEvent = {
    eventType: string;
    timestamp: string;
    sessionId: string;
    machineId: string;
    githubUsername: string;
    data: { [key: string]: any };
};
