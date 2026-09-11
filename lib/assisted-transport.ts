export type AssistedTransferInput = {
  wheelchairUser?: boolean | null;
  wheelchairNeeded?: boolean | null;
  wheelchairType?: string | null;
  canTransferToSeat?: boolean | null;
  passengerRemainsInWheelchair?: boolean | null;
};

/** A wheelchair user who cannot transfer must be assigned a wheelchair-accessible vehicle. */
export function requiresWav(input: AssistedTransferInput) {
  return Boolean(
    input.passengerRemainsInWheelchair ||
      ((input.wheelchairUser || input.wheelchairNeeded) && input.canTransferToSeat === false)
  );
}
