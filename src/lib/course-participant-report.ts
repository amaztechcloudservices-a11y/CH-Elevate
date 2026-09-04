import { z } from "zod";

export const participantReportSchema = z.object({
  courseId: z.uuid(),
  participantIds: z.array(z.uuid()).min(1, "Select at least one participant.").max(1000, "Export up to 1,000 participants at a time.").refine((ids) => new Set(ids).size === ids.length, "Duplicate participants are not allowed."),
}).strict();

export type CourseParticipantReportRow = {
  participantId: string; name: string; email: string; status: string; attendance: string;
  offeringCode: string; startsAt: Date; timeZone: string; organisationName: string | null;
};
