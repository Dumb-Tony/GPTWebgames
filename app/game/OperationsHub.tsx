"use client";

import {
  CONTRACT_IDS,
  CONTRACTS,
  DESTINATION_IDS,
  DESTINATIONS,
  MAX_EQUIPPED_UPGRADES,
  UPGRADE_IDS,
  UPGRADES,
  type ContractId,
  type ProgressionSave,
  type UpgradeId,
} from "./progression";
import styles from "./game.module.css";

export function OperationsHub({
  activeStation,
  progression,
  selectedContractId,
  contractLocked,
  onContractSelect,
  onPurchaseUpgrade,
  onToggleUpgrade,
}: {
  activeStation: "contracts" | "equipment" | "maintenance";
  progression: ProgressionSave;
  selectedContractId: ContractId;
  contractLocked: boolean;
  onContractSelect: (contractId: ContractId) => void;
  onPurchaseUpgrade: (upgradeId: UpgradeId) => void;
  onToggleUpgrade: (upgradeId: UpgradeId) => void;
}) {
  const selectedDestinationId = CONTRACTS[selectedContractId].destinationId;
  const availableContracts = CONTRACT_IDS.filter(
    (contractId) => CONTRACTS[contractId].destinationId === selectedDestinationId,
  );

  return (
    <section className={styles.operationsHub} aria-label="S.P.A.C.E. operations hub">
      <header className={styles.hubHeader}>
        <div>
          <span>ORBITAL OPERATIONS // PERSONAL RECORD</span>
          <strong>GOON CAREER TERMINAL</strong>
        </div>
        <div className={styles.careerBalances}>
          <span><b>¢{progression.credits}</b> CREDITS</span>
          <span><b>{progression.research}</b> RESEARCH</span>
          <span>
            <b>{progression.successfulMissions}</b> ACCEPTABLE MISSIONS
          </span>
          <span><b>¢{progression.totalRepairCredits}</b> MAINTENANCE PAID</span>
        </div>
      </header>

      {activeStation === "contracts" && (
        <div className={styles.hubColumns}>
          <div className={styles.hubSection}>
            <div className={styles.hubSectionTitle}>
              <span>01 // DESTINATION CONTROL</span>
              <small>{contractLocked ? "MISSION LEAD SELECTS" : "SELECT FLIGHT PLAN"}</small>
            </div>
            <div className={styles.destinationCards}>
              {DESTINATION_IDS.map((destinationId) => {
                const destination = DESTINATIONS[destinationId];
                const selected = selectedDestinationId === destinationId;
                const unlocked = progression.research >= destination.unlockResearch;
                return (
                  <button
                    key={destination.id}
                    type="button"
                    className={selected ? styles.destinationActive : styles.destinationSurveyed}
                    onClick={() => onContractSelect(destination.defaultContractId)}
                    disabled={contractLocked || !unlocked}
                    aria-pressed={selected}
                  >
                    <span>{`${destination.code} // ${destination.classification}`}</span>
                    <strong>{destination.name}</strong>
                    <p>{destination.description}</p>
                    <small>{unlocked ? `OPEN · ${destination.hazard}` : `LOCKED · ${destination.unlockResearch} RESEARCH`}</small>
                  </button>
                );
              })}
              <div className={styles.destinationLocked}>
                <span>IC-03 // COMETARY BODY</span>
                <strong>Icebox Comet</strong>
                <p>Frozen tunnels, geysers, and samples that resent room temperature.</p>
                <small>ROUTE DATA INCOMPLETE · 18 RESEARCH</small>
              </div>
            </div>
          </div>

          <div className={styles.hubSection}>
            <div className={styles.hubSectionTitle}>
              <span>02 // {DESTINATIONS[selectedDestinationId].code} CONTRACT BOARD</span>
              <small>{contractLocked ? "MISSION LEAD SELECTS" : "CHOOSE SHIFT"}</small>
            </div>
            <div className={styles.contractCards}>
              {availableContracts.map((contractId) => {
                const contract = CONTRACTS[contractId];
                const selected = selectedContractId === contractId;
                return (
                  <button
                    key={contract.id}
                    type="button"
                    className={selected ? styles.hubSelected : ""}
                    onClick={() => onContractSelect(contract.id)}
                    disabled={contractLocked}
                    aria-pressed={selected}
                  >
                    <span>{contract.shortName}</span>
                    <strong>{contract.name}</strong>
                    <p>{contract.description}</p>
                    <small>
                      ¢{contract.target} QUOTA · {Math.floor(contract.seconds / 60)}:
                      {String(contract.seconds % 60).padStart(2, "0")} · +¢
                      {contract.creditReward}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeStation === "equipment" && (
        <div className={styles.hubSection}>
          <div className={styles.hubSectionTitle}>
            <span>03 // EQUIPMENT CAGE</span>
            <small>
              {progression.equippedUpgradeIds.length}/{MAX_EQUIPPED_UPGRADES} MODULES EQUIPPED
            </small>
          </div>
          <div className={styles.upgradeCards}>
            {UPGRADE_IDS.map((upgradeId) => {
              const upgrade = UPGRADES[upgradeId];
              const owned = progression.ownedUpgradeIds.includes(upgradeId);
              const equipped = progression.equippedUpgradeIds.includes(upgradeId);
              const affordable =
                progression.credits >= upgrade.creditCost &&
                progression.research >= upgrade.researchRequired;
              return (
                <div key={upgrade.id} className={equipped ? styles.upgradeEquipped : ""}>
                  <span>{equipped ? "INSTALLED" : owned ? "OWNED" : "R&D ISSUE"}</span>
                  <strong>{upgrade.name}</strong>
                  <p>{upgrade.description}</p>
                  <button
                    type="button"
                    onClick={() =>
                      owned ? onToggleUpgrade(upgrade.id) : onPurchaseUpgrade(upgrade.id)
                    }
                    disabled={
                      (!owned && !affordable) ||
                      (owned &&
                        !equipped &&
                        progression.equippedUpgradeIds.length >= MAX_EQUIPPED_UPGRADES)
                    }
                  >
                    {owned
                      ? equipped
                        ? "UNEQUIP"
                        : progression.equippedUpgradeIds.length >= MAX_EQUIPPED_UPGRADES
                          ? "SLOTS FULL"
                          : "EQUIP"
                      : `BUY ¢${upgrade.creditCost} · R${upgrade.researchRequired}`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className={styles.freeLoadout}>
            COMPANY MINIMUM LOADOUT IS ALWAYS FREE: FIELD KIT · SCANNER · TETHER · EVA THRUSTER
          </p>
          <p className={styles.freeLoadout}>
            FIELD ASSIGNMENT: THREE COLOR-CODED SPECIALIST CASES DEPLOY BESIDE THE LANDER.
            CLAIM ONE FOR +30% MATCHED OUTPUT, OR TOSS IT TO THE GOON WHO NEEDS IT.
          </p>
        </div>
      )}

      {activeStation === "maintenance" && (
        <div className={styles.hubSection}>
          <div className={styles.hubSectionTitle}>
            <span>04 // MAINTENANCE + SAFETY</span>
            <small>RECOVERY GUARANTEED</small>
          </div>
          <div className={styles.maintenancePolicy}>
            <span>PAYROLL POLICY</span>
            <strong>REPAIRS ARE DEDUCTED FROM MISSION PAY — NEVER FROM YOUR SAVINGS.</strong>
            <small>
              Every run still deposits at least ¢25. Tool jams cost ¢12 and emergency suit
              reboots cost ¢30 after recovery caps are applied.
            </small>
          </div>
          <div className={styles.maintenanceSummary}>
            <div>
              <span>LIFETIME REPAIRS</span>
              <strong>¢{progression.totalRepairCredits}</strong>
            </div>
            <div>
              <span>FAILED SHIFTS</span>
              <strong>{progression.failedMissions}</strong>
            </div>
            <div>
              <span>RECOVERY WAGE</span>
              <strong>¢25 MINIMUM</strong>
            </div>
          </div>
        </div>
      )}
      <footer className={styles.hubFooter}>
        PERSONAL: credits, research, career record, and installed modules stay on this
        device. CREW-SHARED: contract, timer, world state, cargo, and mission score belong
        to the current run. Visiting players never spend the mission lead&apos;s credits.
      </footer>
    </section>
  );
}
