import { and, isNull, notInArray } from "drizzle-orm";
import { appointments } from "@/db/schema";

// Shared by public slots and administrator collision checks.
export const occupiedBooking = () => and(isNull(appointments.deletedAt), notInArray(appointments.status, ["cancelled", "rejected"]));
