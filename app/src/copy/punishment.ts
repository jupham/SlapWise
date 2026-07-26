import type { PunishmentType } from '../types';

/**
 * Phrasing for who a punishment happens to.
 *
 * The debtor is the player who *takes* the punishment and the creditor is the
 * one who delivers it — the grog resolver rejects a shot unless the caller is
 * the debtor, which settles the direction. The app used to render this as
 * "Marcus owes Jordan a slap", which reads as Marcus having to go and slap
 * Jordan: precisely backwards. Saying what physically happens removes the
 * ambiguity, and keeping it in one place stops the Feed, My Slate and Confirm
 * Resolution drifting apart again.
 */

export interface PunishmentPhraseOptions {
  punishment: PunishmentType;
  /** Display name of the player taking the punishment. */
  debtor: string;
  /** Display name of the player delivering it. */
  creditor: string;
  debtorIsYou?: boolean;
  creditorIsYou?: boolean;
  /** Past tense once it has actually been delivered. */
  past?: boolean;
}

export function punishmentPhrase({
  punishment,
  debtor,
  creditor,
  debtorIsYou = false,
  creditorIsYou = false,
  past = false,
}: PunishmentPhraseOptions): string {
  if (punishment === 'infinity_grog') {
    // The grog is impersonal — who called it is visible from the thread, so
    // naming them again here just adds noise.
    if (debtorIsYou) return past ? 'You took your shot' : 'You take a shot from the grog';
    return past ? `${debtor} took their shot` : `${debtor} takes a shot from the grog`;
  }

  // Slapping is personal, so both sides are always named.
  if (debtorIsYou) return past ? `${creditor} slapped you` : `${creditor} slaps you`;
  if (creditorIsYou) return past ? `You slapped ${debtor}` : `You slap ${debtor}`;
  return past ? `${debtor} got slapped by ${creditor}` : `${debtor} gets slapped by ${creditor}`;
}

/** Short label for a punishment, for badges and value slots. */
export function punishmentLabel(punishment: PunishmentType): string {
  return punishment === 'infinity_grog' ? 'Infinity grog' : 'Slap';
}
