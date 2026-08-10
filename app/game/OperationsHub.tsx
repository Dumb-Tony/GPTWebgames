"use client";

import {
  CONTRACT_IDS,
  CONTRACTS,
  MAX_EQUIPPED_UPGRADES,
  UPGRADE_IDS,
  UPGRADES,
  type ContractId,
  type ProgressionSave,
  type UpgradeId,
} from "./progression";
import styles from "./game.module.css";

export function OperationsHub({
  progression,
  selectedContractId,
  contractLocked,
  onContractSelect,
  onPurchaseUpgrade,
  onToggleUpgrade,
}: {
  progression: ProgressionSave;
  selectedContractId: ContractId;
  contractLocked: boolean;
  onContractSelect: (contractId: ContractId) => void;
  onPurchaseUpgrade: (upgradeId: UpgradeId) => void;
  onToggleUpgrade: (upgradeId: UpgradeId) => void;
}) {
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

      <div className={styles.hubColumns}>
        <div className={styles.hubSection}>
          <div className={styles.hubSectionTitle}>
            <span>01 // CONTRACT BOARD</span>
            <small>{contractLocked ? "MISSION LEAD SELECTS" : "CHOOSE ONE"}</small>
          </div>
          <div className={styles.contractCards}>
            {CONTRACT_IDS.map((contractId) => {
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

        <div className={styles.hubSection}>
          <div className={styles.hubSectionTitle}>
            <span>02 // DESTINATION DOSSIERS</span>
            <small>RESEARCH UNLOCKS</small>
          </div>
          <div className={styles.destinationCards}>
            <div className={styles.destinationActive}>
              <span>PM-01</span>
              <strong>THE PRACTICE MOON</strong>
              <small>OPEN · LOW GRAVITY · POOR SUPERVISION</small>
            </div>
            <div className={progression.research >= 8 ? styles.destinationSurveyed : ""}>
              <span>RB-02</span>
              <strong>THE RUST BELT</strong>
              <small>
                {progression.research >= 8 ? "SURVEYED · EXPEDITION PENDING" : "LOCKED · 8 RESEARCH"}
              </small>
            </div>
            <div className={progression.research >= 18 ? styles.destinationSurveyed : ""}>
              <span>IC-03</span>
              <strong>ICEBOX COMET</strong>
              <small>
                {progression.research >= 18 ? "SURVEYED · EXPEDITION PENDING" : "LOCKED · 18 RESEARCH"}
              </small>
            </div>
          </div>
        </div>
      </div>

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
          COMPANY MINIMUM LOADOUT IS ALWAYS FREE: ISSUE DRILL · SCANNER · TETHER · EVA THRUSTER
        </p>
        <div className={styles.maintenancePolicy}>
          <span>04 // MAINTENANCE POLICY</span>
          <strong>REPAIRS ARE DEDUCTED FROM MISSION PAY — NEVER FROM YOUR SAVINGS.</strong>
          <small>
            Every run still deposits at least ¢25. Tool jams cost ¢12 and emergency suit
            reboots cost ¢30 after recovery caps are applied.
          </small>
        </div>
      </div>
      <footer className={styles.hubFooter}>
        PERSONAL: credits, research, career record, and installed modules stay on this
        device. CREW-SHARED: contract, timer, world state, cargo, and mission score belong
        to the current run. Visiting players never spend the mission lead&apos;s credits.
      </footer>
    </section>
  );
}
