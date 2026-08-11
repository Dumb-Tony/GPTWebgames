import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { crewActions, crewMembers, crewRooms } from "../../../db/schema";
import {
  CREW_MAX_MEMBERS,
  clampCrewTransform,
  isCrewMemberFresh,
  normalizeCrewName,
  normalizeRoomCode,
  type CrewActionType,
  type CrewMissionState,
  type CrewRole,
  type CrewRoomPhase,
} from "../../game/crewNetwork";

const actionTypes = new Set<CrewActionType>([
  "scan",
  "interact",
  "throw",
  "tether",
  "magnet",
  "stabilize",
  "ping",
  "ping_help",
  "ping_cargo",
  "ping_danger",
  "ping_ship",
]);
const roomPhases = new Set<CrewRoomPhase>([
  "lobby",
  "active",
  "success",
  "failed",
  "closed",
]);
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function noStore(payload: unknown, init: ResponseInit = {}) {
  return Response.json(payload, {
    ...init,
    headers: { ...init.headers, "Cache-Control": "no-store" },
  });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "Crew Link is still being installed. Try again in a moment.";
  }
  return "Crew Link lost contact with mission control.";
}

function randomRoomCode() {
  const random = new Uint32Array(5);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => roomAlphabet[value % roomAlphabet.length]).join("");
}

function randomMissionSeed() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return 1 + (random[0] % 99_990);
}

function sessionPayload(
  roomCode: string,
  member: typeof crewMembers.$inferSelect,
  missionSeed: number,
) {
  return {
    session: {
      roomCode,
      memberId: member.id,
      token: member.token,
      role: member.role as CrewRole,
      name: member.name,
      colorIndex: member.colorIndex,
      missionSeed,
    },
  };
}

async function authorize(request: Request) {
  const url = new URL(request.url);
  const roomCode = normalizeRoomCode(url.searchParams.get("room") ?? "");
  const memberId = url.searchParams.get("member") ?? "";
  const token = request.headers.get("x-crew-token") ?? "";
  if (roomCode.length !== 5 || !memberId || !token) return null;

  const db = getDb();
  const [member] = await db
    .select()
    .from(crewMembers)
    .where(
      and(
        eq(crewMembers.id, memberId),
        eq(crewMembers.roomCode, roomCode),
        eq(crewMembers.token, token),
      ),
    )
    .limit(1);
  if (!member) return null;

  const [room] = await db
    .select()
    .from(crewRooms)
    .where(eq(crewRooms.code, roomCode))
    .limit(1);
  if (!room) return null;
  return { db, member, room };
}

async function roomSnapshot(
  db: ReturnType<typeof getDb>,
  room: typeof crewRooms.$inferSelect,
  requester: typeof crewMembers.$inferSelect,
) {
  const memberRows = await db
    .select()
    .from(crewMembers)
    .where(eq(crewMembers.roomCode, room.code))
    .orderBy(asc(crewMembers.joinedAt));
  const now = Date.now();
  const hostIsFresh = memberRows.some(
    (member) =>
      member.id === room.hostMemberId && isCrewMemberFresh(member.lastSeenAt, now),
  );
  const members = memberRows
    .filter((member) => member.id === requester.id || isCrewMemberFresh(member.lastSeenAt, now))
    .map((member) => ({
      id: member.id,
      name: member.name,
      colorIndex: member.colorIndex,
      role: member.role as CrewRole,
      x: member.x / 1000,
      y: member.y / 1000,
      z: member.z / 1000,
      yaw: member.yaw / 1000,
      inputMask: member.inputMask,
      lastSeenAt: member.lastSeenAt,
    }));

  const actionRows =
    requester.id === room.hostMemberId
      ? await db
          .select()
          .from(crewActions)
          .where(
            and(
              eq(crewActions.roomCode, room.code),
              gt(crewActions.id, room.actionCursor),
            ),
          )
          .orderBy(asc(crewActions.id))
          .limit(80)
      : [];

  let authoritativeState: CrewMissionState | null = null;
  if (room.authoritativeState) {
    try {
      authoritativeState = JSON.parse(room.authoritativeState) as CrewMissionState;
    } catch {
      authoritativeState = null;
    }
  }

  return {
    roomCode: room.code,
    phase:
      requester.id !== room.hostMemberId && !hostIsFresh
        ? ("closed" as const)
        : (room.phase as CrewRoomPhase),
    missionSeed: room.missionSeed,
    revision: room.revision,
    actionCursor: room.actionCursor,
    hostMemberId: room.hostMemberId,
    members,
    actions: actionRows.map((action) => ({
      id: action.id,
      memberId: action.memberId,
      sequence: action.sequence,
      type: action.type as CrewActionType,
      createdAt: action.createdAt,
    })),
    authoritativeState,
    serverTime: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      action?: "create" | "join";
      name?: string;
      roomCode?: string;
    };
    const name = normalizeCrewName(payload.name ?? "");
    if (name.length < 2) {
      return noStore({ error: "Use a call sign with at least two characters." }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const memberId = crypto.randomUUID();
    const token = crypto.randomUUID();

    if (payload.action === "create") {
      let roomCode = "";
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = randomRoomCode();
        const [existing] = await db
          .select({ code: crewRooms.code })
          .from(crewRooms)
          .where(eq(crewRooms.code, candidate))
          .limit(1);
        if (!existing) {
          roomCode = candidate;
          break;
        }
      }
      if (!roomCode) {
        return noStore({ error: "Mission control ran out of room codes. Try again." }, { status: 503 });
      }

      const missionSeed = randomMissionSeed();
      await db.insert(crewRooms).values({
        code: roomCode,
        hostMemberId: memberId,
        missionSeed,
        phase: "lobby",
        createdAt: now,
        updatedAt: now,
      });
      const [member] = await db
        .insert(crewMembers)
        .values({
          id: memberId,
          roomCode,
          token,
          name,
          colorIndex: 0,
          role: "host",
          joinedAt: now,
          lastSeenAt: now,
        })
        .returning();
      return noStore(sessionPayload(roomCode, member, missionSeed), { status: 201 });
    }

    if (payload.action === "join") {
      const roomCode = normalizeRoomCode(payload.roomCode ?? "");
      if (roomCode.length !== 5) {
        return noStore({ error: "Enter the five-character crew code." }, { status: 400 });
      }
      const [room] = await db
        .select()
        .from(crewRooms)
        .where(eq(crewRooms.code, roomCode))
        .limit(1);
      if (!room || room.phase === "closed") {
        return noStore({ error: "That crew room no longer exists." }, { status: 404 });
      }
      if (room.phase !== "lobby") {
        return noStore({ error: "That crew has already launched." }, { status: 409 });
      }
      const members = await db
        .select()
        .from(crewMembers)
        .where(eq(crewMembers.roomCode, roomCode));
      const activeMembers = members.filter((member) => isCrewMemberFresh(member.lastSeenAt));
      if (activeMembers.length >= CREW_MAX_MEMBERS) {
        return noStore({ error: "That crew already has four scientists." }, { status: 409 });
      }
      const usedColors = new Set(activeMembers.map((member) => member.colorIndex));
      const colorIndex = [0, 1, 2, 3].find((index) => !usedColors.has(index)) ?? 0;
      const [member] = await db
        .insert(crewMembers)
        .values({
          id: memberId,
          roomCode,
          token,
          name,
          colorIndex,
          role: "guest",
          joinedAt: now,
          lastSeenAt: now,
        })
        .returning();
      return noStore(sessionPayload(roomCode, member, room.missionSeed), { status: 201 });
    }

    return noStore({ error: "Choose create or join." }, { status: 400 });
  } catch (error) {
    return noStore({ error: routeError(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const authorized = await authorize(request);
    if (!authorized) return noStore({ error: "Crew session expired." }, { status: 401 });
    return noStore({ room: await roomSnapshot(authorized.db, authorized.room, authorized.member) });
  } catch (error) {
    return noStore({ error: routeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authorized = await authorize(request);
    if (!authorized) return noStore({ error: "Crew session expired." }, { status: 401 });
    const { db, member, room } = authorized;
    const payload = (await request.json()) as {
      presence?: { x?: number; y?: number; z?: number; yaw?: number; inputMask?: number };
      action?: { sequence?: number; type?: CrewActionType };
      authoritativeState?: CrewMissionState;
      phase?: CrewRoomPhase;
      ackActionId?: number;
    };
    const now = new Date().toISOString();
    const presence = clampCrewTransform(payload.presence ?? {});
    const update: Partial<typeof crewMembers.$inferInsert> = {
      x: Math.round(presence.x * 1000),
      y: Math.round(presence.y * 1000),
      z: Math.round(presence.z * 1000),
      yaw: Math.round(presence.yaw * 1000),
      inputMask: presence.inputMask,
      lastSeenAt: now,
    };

    const actionSequence = Math.max(0, Math.trunc(Number(payload.action?.sequence) || 0));
    const actionType = payload.action?.type;
    if (
      actionType &&
      actionTypes.has(actionType) &&
      actionSequence > member.actionSequence &&
      member.role !== "host"
    ) {
      await db.insert(crewActions).values({
        roomCode: room.code,
        memberId: member.id,
        sequence: actionSequence,
        type: actionType,
        createdAt: now,
      });
      update.actionSequence = actionSequence;
    }
    await db.update(crewMembers).set(update).where(eq(crewMembers.id, member.id));

    let nextRoom = room;
    if (member.id === room.hostMemberId) {
      const roomUpdate: Partial<typeof crewRooms.$inferInsert> = { updatedAt: now };
      if (payload.phase && roomPhases.has(payload.phase)) {
        roomUpdate.phase = payload.phase;
        if (payload.phase === "lobby" && room.phase !== "lobby") {
          roomUpdate.authoritativeState = null;
          roomUpdate.revision = room.revision + 1;
        }
      }
      if (payload.authoritativeState) {
        const serialized = JSON.stringify(payload.authoritativeState);
        if (serialized.length > 48_000) {
          return noStore({ error: "Authoritative mission snapshot is too large." }, { status: 413 });
        }
        roomUpdate.authoritativeState = serialized;
        roomUpdate.revision = room.revision + 1;
      }
      const ackActionId = Math.max(room.actionCursor, Math.trunc(Number(payload.ackActionId) || 0));
      roomUpdate.actionCursor = ackActionId;
      const [updatedRoom] = await db
        .update(crewRooms)
        .set(roomUpdate)
        .where(eq(crewRooms.code, room.code))
        .returning();
      nextRoom = updatedRoom;
    }

    return noStore({ room: await roomSnapshot(db, nextRoom, { ...member, ...update }) });
  } catch (error) {
    return noStore({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authorized = await authorize(request);
    if (!authorized) return noStore({ ok: true });
    const { db, member, room } = authorized;
    if (member.id === room.hostMemberId) {
      await db
        .update(crewRooms)
        .set({ phase: "closed", updatedAt: new Date().toISOString() })
        .where(eq(crewRooms.code, room.code));
    }
    await db.delete(crewMembers).where(eq(crewMembers.id, member.id));
    return noStore({ ok: true });
  } catch (error) {
    return noStore({ error: routeError(error) }, { status: 500 });
  }
}
