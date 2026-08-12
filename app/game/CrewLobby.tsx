"use client";

import { useState } from "react";
import {
  CREW_INPUT_DOWNED,
  CREW_INPUT_DRILL,
  CREW_INPUT_MOVING,
  CREW_INPUT_THRUSTER,
  CREW_MAX_MEMBERS,
  crewColor,
  normalizeCrewName,
  normalizeRoomCode,
  type CrewNetworkTuning,
  type CrewRoomSnapshot,
  type CrewSession,
} from "./crewNetwork";
import styles from "./game.module.css";

function crewStatus(inputMask: number) {
  if ((inputMask & CREW_INPUT_DOWNED) !== 0) return "SAFE MODE";
  if ((inputMask & CREW_INPUT_DRILL) !== 0) return "DRILLING";
  if ((inputMask & CREW_INPUT_THRUSTER) !== 0) return "BOOSTING";
  if ((inputMask & CREW_INPUT_MOVING) !== 0) return "MOVING";
  return "READY";
}

type CrewLobbyProps = {
  session: CrewSession | null;
  room: CrewRoomSnapshot | null;
  busy: boolean;
  error: string | null;
  tuning: CrewNetworkTuning;
  onTuningChange: (tuning: CrewNetworkTuning) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onLeave: () => void;
  onLaunch: () => void;
  onSolo: () => void;
};

export function CrewLobby({
  session,
  room,
  busy,
  error,
  tuning,
  onTuningChange,
  onCreate,
  onJoin,
  onLeave,
  onLaunch,
  onSolo,
}: CrewLobbyProps) {
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "GOON";
    try {
      const saved = window.localStorage.getItem("moon-goons-crew-name");
      return saved ? normalizeCrewName(saved) : "GOON";
    } catch {
      return "GOON";
    }
  });
  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return normalizeRoomCode(new URLSearchParams(window.location.search).get("room") ?? "");
  });
  const [inviteStatus, setInviteStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const saveName = () => {
    const normalized = normalizeCrewName(name);
    setName(normalized);
    try {
      window.localStorage.setItem("moon-goons-crew-name", normalized);
    } catch {
      // The call sign only needs to persist when storage is available.
    }
    return normalized;
  };

  if (session) {
    const members = room?.members ?? [];
    const copyInvite = async () => {
      const invite = `${window.location.origin}/?room=${session.roomCode}`;
      try {
        await window.navigator.clipboard.writeText(invite);
        setInviteStatus("copied");
      } catch {
        setInviteStatus("failed");
      }
    };
    return (
      <section className={styles.crewLobby} aria-label="Crew lobby">
        <div className={styles.crewLobbyHeader}>
          <div>
            <span>CREW LINK // {session.role.toUpperCase()}</span>
            <strong>{session.roomCode}</strong>
          </div>
          <div className={styles.crewLobbyButtons}>
            <button type="button" onClick={() => void copyInvite()} disabled={busy}>
              {inviteStatus === "copied"
                ? "INVITE COPIED"
                : inviteStatus === "failed"
                  ? "COPY FAILED"
                  : "COPY INVITE"}
            </button>
            <button type="button" onClick={onLeave} disabled={busy}>
              LEAVE
            </button>
          </div>
        </div>
        <p className={styles.crewInvite}>
          Send this five-character room code to up to {CREW_MAX_MEMBERS - 1} other
          scientists. Everyone receives the same contract seed.
        </p>
        <div className={styles.crewMembers}>
          {members.map((member) => (
            <div key={member.id}>
              <i style={{ background: crewColor(member.colorIndex).css }} />
              <span>{member.name}</span>
              <small>{member.role === "host" ? "MISSION LEAD" : "FIELD GOON"}</small>
            </div>
          ))}
          {Array.from({ length: Math.max(0, CREW_MAX_MEMBERS - members.length) }).map(
            (_, index) => (
              <div className={styles.crewVacancy} key={`vacancy-${index}`}>
                <i />
                <span>OPEN SUIT</span>
                <small>AWAITING BAD DECISION</small>
              </div>
            ),
          )}
        </div>
        <div className={styles.networkLab}>
          <span>NETWORK STRESS TEST</span>
          <label>
            DELAY
            <select
              value={tuning.addedLatencyMs}
              onChange={(event) =>
                onTuningChange({ ...tuning, addedLatencyMs: Number(event.target.value) })
              }
            >
              <option value={0}>LIVE</option>
              <option value={150}>+150 MS</option>
              <option value={300}>+300 MS</option>
            </select>
          </label>
          <label>
            LOSS
            <select
              value={tuning.packetLossPercent}
              onChange={(event) =>
                onTuningChange({
                  ...tuning,
                  packetLossPercent: Number(event.target.value),
                })
              }
            >
              <option value={0}>0%</option>
              <option value={10}>10%</option>
              <option value={20}>20%</option>
            </select>
          </label>
        </div>
        {error && <p className={styles.crewError}>{error}</p>}
        {session.role === "host" ? (
          <button
            className={styles.crewLaunch}
            type="button"
            onClick={onLaunch}
            disabled={busy || members.length === 0}
          >
            {busy ? "CALIBRATING CREW LINK…" : "LAUNCH CREW CONTRACT"}
          </button>
        ) : (
          <p className={styles.crewWaiting}>WAITING FOR MISSION LEAD TO LAUNCH…</p>
        )}
      </section>
    );
  }

  return (
    <section className={styles.crewLobby} aria-label="Mission mode">
      <div className={styles.crewModeHeader}>
        <span>MISSION MODE</span>
        <strong>SOLO OR 1–4 PLAYER CREW</strong>
      </div>
      <label className={styles.crewNameField}>
        <span>CALL SIGN</span>
        <input
          value={name}
          maxLength={24}
          onChange={(event) => setName(event.target.value)}
          placeholder="GOON"
          autoComplete="nickname"
        />
      </label>
      <div className={styles.crewActions}>
        <button type="button" onClick={onSolo} disabled={busy}>
          SOLO FIELD TEST
        </button>
        <button type="button" onClick={() => onCreate(saveName())} disabled={busy}>
          HOST CREW
        </button>
      </div>
      <div className={styles.crewJoinRow}>
        <input
          aria-label="Five-character crew room code"
          value={code}
          maxLength={5}
          onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
          placeholder="CODE"
          autoCapitalize="characters"
        />
        <button
          type="button"
          onClick={() => onJoin(saveName(), normalizeRoomCode(code))}
          disabled={busy || normalizeRoomCode(code).length !== 5}
        >
          JOIN CREW
        </button>
      </div>
      {error && <p className={styles.crewError}>{error}</p>}
      <small className={styles.crewPrivacy}>
        Room codes are temporary. No account or voice chat required.
      </small>
    </section>
  );
}

export function CrewRoster({
  session,
  room,
  latency,
  onLeave,
}: {
  session: CrewSession;
  room: CrewRoomSnapshot | null;
  latency: number | null;
  onLeave: () => void;
}) {
  const localMember = room?.members.find((member) => member.id === session.memberId);
  const linkQuality =
    latency === null
      ? "syncing"
      : latency <= 120
        ? "stable"
        : latency <= 260
          ? "delayed"
          : "strained";
  return (
    <aside className={styles.crewRoster} aria-label="Connected crew">
      <div className={styles.crewRosterHeader}>
        <span>CREW // {session.roomCode}</span>
        <strong data-link={linkQuality}>
          {latency === null ? "SYNCING" : `${linkQuality.toUpperCase()} · ${latency} MS`}
        </strong>
      </div>
      {(room?.members ?? []).map((member) => {
        const distance =
          localMember && member.id !== session.memberId
            ? Math.hypot(
                member.x - localMember.x,
                member.y - localMember.y,
                member.z - localMember.z,
              )
            : null;
        return (
          <div
            className={styles.crewRosterMember}
            data-downed={(member.inputMask & CREW_INPUT_DOWNED) !== 0 || undefined}
            key={member.id}
          >
            <i style={{ background: crewColor(member.colorIndex).css }} />
            <span>{member.name}</span>
            <small>
              {member.id === session.memberId ? "YOU · " : ""}
              {crewStatus(member.inputMask)}
              {distance === null ? "" : ` · ${Math.round(distance)}m`}
            </small>
          </div>
        );
      })}
      <p className={styles.crewSignalHint}>P LOCATION · 1 HELP · 2 CARGO · 3 DANGER · 4 SHIP</p>
      <button type="button" onClick={onLeave}>LEAVE CREW</button>
    </aside>
  );
}
